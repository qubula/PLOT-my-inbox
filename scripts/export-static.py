"""
Prepares the pipeline output for static hosting (e.g. Netlify), where the
Flask API in server.py is not available:

  1. Bakes thread colours into web/output/cluster_structure.json, using the
     same colour logic server.py applies on the fly.
  2. Writes web/output/macro_subs/<macro_id>.json: every sub-cluster's thread
     data for one macro in a single file (the payload server.py serves from
     /api/macro/<id>/subs), so the app can load a macro in one request.

Run from the repo root after the pipeline notebook has finished:
    python scripts/export-static.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from server import OUTPUT, _load_structure  # noqa: E402

META_DIR = os.path.join(OUTPUT, 'emails_meta')
SUBS_DIR = os.path.join(OUTPUT, 'macro_subs')

structure = _load_structure()
with open(os.path.join(OUTPUT, 'cluster_structure.json'), 'w') as f:
    json.dump(structure, f)

os.makedirs(SUBS_DIR, exist_ok=True)
count = 0
for galaxy in structure.get('galaxies', []):
    for macro in galaxy.get('macros', []):
        result = {}
        for sub in macro.get('subClusters', []):
            path = os.path.join(META_DIR, f"sub_{sub['id']}.json")
            if os.path.exists(path):
                with open(path) as f:
                    result[str(sub['id'])] = json.load(f)
            else:
                result[str(sub['id'])] = {'threads': [], 'floating': []}
        with open(os.path.join(SUBS_DIR, f"{macro['id']}.json"), 'w') as f:
            json.dump(result, f)
        count += 1

print(f'Baked thread colours into cluster_structure.json and wrote {count} macro files')
