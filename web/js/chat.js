(function () {
  'use strict';

  // Flask runs on 5001 (separate from Live Server).
  // Change this if you start Flask on a different port.
  const API_BASE = 'http://localhost:5001';

  const panel   = document.getElementById('chat-panel');
  const btn     = document.getElementById('chat-btn');
  const input   = document.getElementById('chat-input');
  const msgs    = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send');

  if (!panel || !btn || !input || !msgs || !sendBtn) return;

  const chatSlot = document.getElementById('icon-slot-chat');
  const history = [];

  btn.addEventListener('click', () => {
    const isOpen = chatSlot.classList.toggle('open');
    if (isOpen) {
      input.focus();
      // Hide the right-hand panel stack while the chat is open so they don't overlap
      document.body.classList.add('chat-is-open');
    } else {
      document.body.classList.remove('chat-is-open');
    }
  });

  // Close when clicking outside the slot
  document.addEventListener('click', e => {
    if (chatSlot && !chatSlot.contains(e.target)) {
      chatSlot.classList.remove('open');
      document.body.classList.remove('chat-is-open');
    }
  });

  function appendMsg(role, text, refs) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;

    if (refs && refs.length) {
      const refRow = document.createElement('div');
      refRow.className = 'chat-refs';
      refs.forEach(r => {
        const chip = document.createElement('span');
        chip.className = 'chat-ref' + (r.sub_id?.startsWith?.('__search_') ? ' chat-ref--search' : '');
        const label = r.title || `Cluster ${r.sub_id}`;
        chip.textContent = r.email_count ? `${label}  (${r.email_count})` : label;
        if (r.reason) chip.title = r.reason;
        chip.addEventListener('click', e => {
          e.stopPropagation(); // prevent panel-close listener from firing
          if (typeof window.openSubById === 'function') {
            window.openSubById(r.sub_id);
          }
        });
        refRow.appendChild(chip);
      });
      div.appendChild(refRow);
    }

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    appendMsg('user', text);
    history.push({ role: 'user', content: text });

    const thinking = appendMsg('bot', 'Thinking…');
    thinking.classList.add('chat-thinking');

    try {
      const res  = await fetch(`${API_BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history: history.slice(-8) }),
        signal:  AbortSignal.timeout(120_000) // 2 min — model may take time on first load
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      msgs.removeChild(thinking);

      if (data.error) {
        appendMsg('bot', `Error: ${data.error}`);
      } else {
        // If the server found filter results, create the cluster now and patch the ref chip
        if (data.filter_result?.matched_nodes?.length > 0 && typeof window.createSearchCluster === 'function') {
          const { query_key, matched_nodes, label } = data.filter_result;
          const subId = window.createSearchCluster(query_key, matched_nodes, label);
          if (data.refs?.[0]) data.refs[0].sub_id = subId;
        }
        appendMsg('bot', data.answer || '(no response)', data.refs || []);
        history.push({ role: 'assistant', content: data.answer || '' });
      }
    } catch (e) {
      const isServerDown = e instanceof TypeError && e.message.includes('fetch');
      thinking.textContent = isServerDown
        ? 'Flask server not reachable — open a terminal and run: venv/bin/python server.py'
        : `Error: ${e.message}`;
      thinking.classList.remove('chat-thinking');
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // prevent keys from reaching p5's canvas handler
    if (e.key === 'Enter' && !e.shiftKey) send();
  });
})();
