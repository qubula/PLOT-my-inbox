#!/bin/sh
# Concatenates the front-end modules in web/js/ into web/bundle.js.
# Order matters: later files use globals defined by earlier ones.
# Usage (from the repo root): sh scripts/build-bundle.sh
set -e
cd "$(dirname "$0")/../web/js"
cat data.js layout.js emailNode.js subCluster.js macroCluster.js galaxy.js \
    drag.js trash.js archive.js search.js tree.js carbon.js panel.js \
    sketch.js chat.js cursor.js onboarding.js navHint.js > ../bundle.js
echo "Wrote web/bundle.js"
