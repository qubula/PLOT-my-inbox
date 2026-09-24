"""
Email Music — local Flask server with the chat assistant
Serves the static app in web/ and adds /api/chat, backed by Gemma and
nomic-embed-text running in Ollama.
Run: python server.py
Then open: http://localhost:5001
"""

import os
import json
import re
import requests as req
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

OLLAMA_CHAT   = 'http://localhost:11434/api/chat'
OLLAMA_EMBED  = 'http://localhost:11434/api/embeddings'
CHAT_MODEL    = 'gemma3:4b'       # better instruction-following than gemma4:e2b
EMBED_MODEL   = 'nomic-embed-text'

# In-memory cache so cluster_structure.json is only read from disk once
_structure_cache = None

# Flat node index for filter searches — built lazily on first filter query
_node_index = None

BASE   = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(BASE, 'web')
OUTPUT = os.path.join(PROJECT, 'output')

# No static_folder — we handle all file serving ourselves to avoid 403s
app = Flask(__name__, static_folder=None)
CORS(app, resources={r"/api/*": {"origins": "*"}})  # allow Live Server on any port


# ── Frontend ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(PROJECT, 'index.html')

@app.route('/<path:filename>')
def project_files(filename):
    return send_from_directory(PROJECT, filename)


# ── Output files ──────────────────────────────────────────────────────────────
# sketch.js requests '../output/viz_data.json' — Flask serves cluster_structure.json
# instead (has the 'galaxies' key) to trigger galaxy mode. All other output
# files (emails_full_contents.json etc.) are served normally.

@app.route('/output/<path:filename>')
def output_files(filename):
    if filename == 'viz_data.json':
        # Return the enriched structure (with thread_colors injected) rather
        # than the raw file, so sub-cluster colours are available from startup.
        return jsonify(_load_structure())
    return send_from_directory(OUTPUT, filename)


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/api/structure')
def structure():
    path = os.path.join(OUTPUT, 'cluster_structure.json')
    if not os.path.exists(path):
        return jsonify({'error': 'Run the pipeline notebook first'}), 404
    with open(path) as f:
        return jsonify(json.load(f))

_THREAD_COLORS = ['#3797B8', '#E6D539', '#CD3D5C', '#FF9FD4', '#E8A26B', '#FF4A00', '#62E599']

_THREAD_COMBOS = {
    2: [
        ['#CD3D5C', '#62E599'],
        ['#FF4A00', '#3797B8'],
        ['#3797B8', '#E8A26B'],
        ['#E6D539', '#FF9FD4'],
    ],
    3: [
        ['#E6D539', '#3797B8', '#FF9FD4'],
        ['#FF9FD4', '#CD3D5C', '#62E599'],
        ['#3797B8', '#62E599', '#E8A26B'],
        ['#FF4A00', '#E8A26B', '#3797B8'],
    ],
    4: [
        ['#E6D539', '#3797B8', '#FF9FD4', '#E8A26B'],
        ['#FF9FD4', '#CD3D5C', '#62E599', '#3797B8'],
        ['#3797B8', '#62E599', '#FF4A00', '#E8A26B'],
        ['#FF4A00', '#E6D539', '#CD3D5C', '#3797B8'],
    ],
}

def _load_structure():
    global _structure_cache
    if _structure_cache is not None:
        return _structure_cache

    with open(os.path.join(OUTPUT, 'cluster_structure.json')) as f:
        data = json.load(f)

    # Inject thread_colors into every sub-cluster so the frontend can show
    # colours immediately without waiting for emails_meta to load.
    for g in data.get('galaxies', []):
        for m in g.get('macros', []):
            for sub in m.get('subClusters', []):
                sub_id = sub['id']
                path   = os.path.join(OUTPUT, 'emails_meta', f'sub_{sub_id}.json')
                colors, seen = [], set()
                if os.path.exists(path):
                    try:
                        with open(path) as f:
                            meta = json.load(f)
                        threads = meta.get('threads', [])
                        multi_count = sum(1 for t in threads if len(t.get('nodes', [])) > 1)
                        combo_size  = 2 if multi_count <= 2 else 3 if multi_count == 3 else 4
                        combo_list  = _THREAD_COMBOS[combo_size]
                        combo       = combo_list[(sub_id * 137) % len(combo_list)]
                        combo_idx   = 0
                        for thread in threads:
                            if len(thread.get('nodes', [])) > 1:
                                c = combo[combo_idx % len(combo)]
                                combo_idx += 1
                                if c not in seen:
                                    seen.add(c)
                                    colors.append(c)
                    except Exception:
                        pass
                sub['thread_colors'] = colors

    _structure_cache = data
    return _structure_cache

@app.route('/api/macro/<int:macro_id>/subs')
def macro_subs(macro_id):
    """Return email thread data for all sub-clusters of a macro in one response."""
    structure = _load_structure()
    for galaxy in structure.get('galaxies', []):
        for macro in galaxy.get('macros', []):
            if macro['id'] == macro_id:
                result = {}
                for sub in macro.get('subClusters', []):
                    sub_id = sub['id']
                    path = os.path.join(OUTPUT, 'emails_meta', f'sub_{sub_id}.json')
                    if os.path.exists(path):
                        with open(path) as f:
                            result[str(sub_id)] = json.load(f)
                    else:
                        result[str(sub_id)] = {'threads': [], 'floating': []}
                return jsonify(result)
    return jsonify({}), 404

@app.route('/api/emails')
def emails():
    sub_id = request.args.get('sub_id', type=int)
    if sub_id is None:
        return jsonify({'error': 'sub_id required'}), 400
    path = os.path.join(OUTPUT, 'emails_meta', f'sub_{sub_id}.json')
    if not os.path.exists(path):
        return jsonify({'threads': [], 'floating': []}), 404
    with open(path) as f:
        return jsonify(json.load(f))

@app.route('/api/email/<int:email_id>')
def email_body(email_id):
    path = os.path.join(OUTPUT, 'email_body', f'email_{email_id}.json')
    if os.path.exists(path):
        with open(path) as f:
            return jsonify(json.load(f))
    # Fallback: scan full contents file
    full = os.path.join(OUTPUT, 'emails_full_contents.json')
    if os.path.exists(full):
        with open(full) as f:
            data = json.load(f)
        for e in data.get('emails', []):
            if e['id'] == email_id:
                return jsonify(e)
    return jsonify({'error': f'email {email_id} not found'}), 404


# ── Semantic search via nomic-embed-text ─────────────────────────────────────
# Embeddings for all sub-cluster titles+summaries, built on first request.
_sub_embeddings = None   # list of dicts: {sub_id, title, macro_title, embedding}

def _embed(text):
    r = req.post(OLLAMA_EMBED,
                 json={"model": EMBED_MODEL, "prompt": text[:2000]},
                 timeout=30)
    return r.json()['embedding']

def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na  = sum(x * x for x in a) ** 0.5
    nb  = sum(x * x for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0

def _build_embedding_cache():
    global _sub_embeddings
    if _sub_embeddings is not None:
        return
    print('[chat] Building semantic search index…', flush=True)
    _sub_embeddings = []
    s = _load_structure()
    for g in s.get('galaxies', []):
        for m in g.get('macros', []):
            for sub in m.get('subClusters', []):
                text = f"{sub['title']}. {sub.get('summary', '')}"
                try:
                    emb = _embed(text)
                    _sub_embeddings.append({
                        'sub_id':      sub['id'],
                        'title':       sub['title'],
                        'macro_title': m['title'],
                        'summary':     sub.get('summary', ''),
                        'email_count': sub.get('email_count', 0),
                        'embedding':   emb,
                    })
                except Exception:
                    pass
    print(f'[chat] Index ready — {len(_sub_embeddings)} clusters embedded.', flush=True)

def _find_relevant_subs(query, top_n=5, threshold=0.6):
    """Find sub-clusters semantically closest to the query.
    Returns full dicts so callers have email_count and summary."""
    _build_embedding_cache()
    try:
        q_emb = _embed(query)
    except Exception:
        return []
    scored = sorted(
        _sub_embeddings,
        key=lambda item: _cosine(q_emb, item['embedding']),
        reverse=True,
    )
    # Only return clusters above the similarity threshold (filter noise)
    top = [s for s in scored[:top_n] if _cosine(q_emb, s['embedding']) >= threshold]
    return top if top else scored[:2]   # always return at least 2


# ── Filter search ─────────────────────────────────────────────────────────────

def _build_node_index():
    global _node_index
    if _node_index is not None:
        return
    meta_dir = os.path.join(OUTPUT, 'emails_meta')
    nodes = []
    if os.path.isdir(meta_dir):
        for fname in sorted(os.listdir(meta_dir)):
            if not fname.startswith('sub_') or not fname.endswith('.json'):
                continue
            try:
                with open(os.path.join(meta_dir, fname)) as f:
                    data = json.load(f)
                for thread in data.get('threads', []):
                    nodes.extend(thread.get('nodes', []))
                nodes.extend(data.get('floating', []))
            except Exception:
                pass
    _node_index = nodes
    print(f'[search] Node index built — {len(nodes)} nodes.', flush=True)


def _detect_filter(message):
    """Return {sender?, year?, subject_kw?} if message looks like a filter query, else None."""
    msg = message.lower()
    filters = {}

    m = re.search(r'(?:from|by|sent by)\s+([a-zA-Z0-9._+%@-]+)', msg)
    if m:
        filters['sender'] = m.group(1).strip('@.-')

    m = re.search(r'\b(19\d{2}|20[0-2]\d)\b', msg)
    if m:
        filters['year'] = m.group(1)

    # "about"/"regarding" only triggers a keyword filter when the term is quoted
    # (e.g. about "invoices") — unquoted, those words introduce a semantic topic
    # and should fall through to the embedding search path.
    # "subject [containing]" is always treated as an explicit keyword filter.
    m = re.search(r'(?:about|regarding)\s+(?:containing\s+)?["\']([a-zA-Z0-9 _-]{2,30})["\']', msg)
    if not m:
        m = re.search(r'subject\s*(?:containing\s+|:\s*)?["\']?([a-zA-Z0-9 _-]{2,30})["\']?', msg)
    if m:
        filters['subject_kw'] = m.group(1).strip()

    return filters if filters else None


def _apply_filter(filters):
    """Return up to 200 unique nodes matching all active filter conditions."""
    _build_node_index()
    sender_q  = filters.get('sender', '').lower()
    year_q    = filters.get('year', '')
    subject_q = filters.get('subject_kw', '').lower()

    seen, results = set(), []
    for n in _node_index:
        eid = n.get('email_id')
        if eid in seen:
            continue
        if sender_q  and sender_q  not in n.get('sender',  '').lower():
            continue
        if year_q    and year_q    not in n.get('date_str', ''):
            continue
        if subject_q and subject_q not in n.get('subject',  '').lower():
            continue
        seen.add(eid)
        results.append(n)
        if len(results) >= 200:
            break
    return results


@app.route('/api/chat', methods=['POST'])
def chat():
    body    = request.json or {}
    message = body.get('message', '').strip()
    history = body.get('history', [])
    if not message:
        return jsonify({'error': 'empty message'}), 400

    # ── Filter path: sender / year / subject keyword ──────────────────────────
    filters = _detect_filter(message)
    if filters:
        matched = _apply_filter(filters)
        parts     = []
        if 'sender'     in filters: parts.append(f"from {filters['sender']}")
        if 'year'       in filters: parts.append(filters['year'])
        if 'subject_kw' in filters: parts.append(f"about '{filters['subject_kw']}'")
        label     = ' · '.join(parts)
        query_key = '|'.join(f"{k}:{v}" for k, v in sorted(filters.items()))

        if matched:
            filter_prompt = (
                f"You are an email inbox assistant. The user searched for emails {label}. "
                f"You found {len(matched)} emails matching that filter. "
                f"Write ONE sentence confirming what was found. "
                f"Example: \"Found 23 emails from work in 2024.\""
            )
            refs = [{
                'sub_id':      '__search_placeholder__',
                'title':       label,
                'email_count': len(matched),
                'reason':      f'Filter: {label}',
            }]
        else:
            filter_prompt = (
                f"You are an email inbox assistant. The user searched for emails {label}. "
                f"No emails matched that filter. Write ONE sentence saying nothing was found."
            )
            refs = []

        ollama_msgs = [{"role": "system", "content": filter_prompt}]
        for h in history[-4:]:
            ollama_msgs.append({"role": h["role"], "content": h["content"]})
        ollama_msgs.append({"role": "user", "content": message})

        try:
            resp = req.post(OLLAMA_CHAT, json={
                "model":    CHAT_MODEL,
                "messages": ollama_msgs,
                "stream":   False,
                "options":  {"temperature": 0.1, "num_predict": 60}
            }, timeout=120)
            resp.raise_for_status()
            answer = resp.json()['message']['content'].strip()
        except Exception as e:
            answer = f"Found {len(matched)} emails {label}." if matched else f"No emails found {label}."

        result = {'answer': answer, 'refs': refs}
        if matched:
            result['filter_result'] = {
                'query_key':     query_key,
                'label':         label,
                'matched_nodes': matched,
            }
        return jsonify(result)

    # ── Semantic search: find the most relevant sub-clusters ──────────────────
    matches = _find_relevant_subs(message)

    # Pre-compute totals server-side so Gemma never needs to count
    total_emails   = sum(m['email_count'] for m in matches)
    cluster_count  = len(matches)

    # Build cluster summaries for the prompt context
    cluster_lines = []
    for m in matches:
        cluster_lines.append(
            f"- Cluster {m['sub_id']} \"{m['title']}\" "
            f"({m['email_count']} emails): {m['summary'][:120]}"
        )
    cluster_text = '\n'.join(cluster_lines) if cluster_lines else '(none found)'

    # Fetch a few email previews from each matched cluster for richer answers
    previews = []
    for m in matches[:3]:
        path = os.path.join(OUTPUT, 'emails_meta', f"sub_{m['sub_id']}.json")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            data = json.load(f)
        nodes = [n for t in data.get('threads', []) for n in t.get('nodes', [])]
        nodes += data.get('floating', [])
        for n in nodes[:3]:
            sender = n.get('sender', '').split('@')[0]
            previews.append(
                f"  [{m['title']}] {n.get('date_str','')[:10]} | "
                f"from {sender} | {n.get('subject','')}"
            )
    preview_text = '\n'.join(previews) if previews else ''

    system_prompt = f"""You are an email inbox assistant. You know exactly what is in this inbox.

MATCHING INBOX CLUSTERS ({total_emails} emails total across {cluster_count} clusters):
{cluster_text}

SAMPLE EMAIL SUBJECTS:
{preview_text if preview_text else '(see cluster summaries above)'}

RESPONSE FORMAT — follow this exactly, no deviation:
Write ONE sentence only. State the total number of emails and what they are about.
Example: "You have 34 emails about flight bookings and travel confirmations across 3 clusters."
Do not add any other text, lists, or explanation. Just that one sentence."""

    ollama_msgs = [{"role": "system", "content": system_prompt}]
    for h in history[-4:]:
        ollama_msgs.append({"role": h["role"], "content": h["content"]})
    ollama_msgs.append({"role": "user", "content": message})

    try:
        resp = req.post(OLLAMA_CHAT, json={
            "model":    CHAT_MODEL,
            "messages": ollama_msgs,
            "stream":   False,
            "options":  {"temperature": 0.1, "num_predict": 80}
        }, timeout=120)
        resp.raise_for_status()
        answer = resp.json()['message']['content'].strip()
    except Exception as e:
        return jsonify({'answer': f'Gemma unavailable — is Ollama running? ({e})', 'refs': []})

    # Strip any REFS Gemma accidentally added (we build refs ourselves)
    if 'REFS:' in answer:
        answer = answer.rsplit('REFS:', 1)[0].strip()

    # Always return ALL matched clusters as refs — don't rely on Gemma for this
    refs = [
        {
            'sub_id':      m['sub_id'],
            'title':       m['title'],
            'email_count': m['email_count'],
            'reason':      m['summary'][:80],
        }
        for m in matches
    ]

    return jsonify({'answer': answer, 'refs': refs})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_ENV') != 'production'
    host = os.environ.get('HOST', '127.0.0.1')
    print(f'\nEmail Music server → http://localhost:{port}\n')
    app.run(debug=debug, host=host, port=port)
