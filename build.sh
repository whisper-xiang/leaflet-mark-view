#!/usr/bin/env bash
# Package the extension into a Chrome Web Store-ready zip.
#
# Uses an explicit all-list of runtime files so dev/tooling artifacts
# (.git, tests/, .claude/, .agents/, launch.json, …) never leak into the upload.
set -euo pipefail
cd "$(dirname "$0")"

OUT="leaflet-mark-view.zip"
rm -f "$OUT"

# Individual runtime files the extension ships.
FILES=(
  manifest.json
  background.js content.js newtab-gate.js
  home.html home.js
  viewer.html viewer.js viewer.css
  popup.html popup.js
  markdown.js md-to-confluence.js lmv-db.js remote-md.js
  README.md LICENSE
)

# Directories shipped whole (icons, default background, vendored libs).
DIRS=( icons public vendor )

zip -rq "$OUT" "${FILES[@]}" "${DIRS[@]}" -x '*.DS_Store'

echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
echo "Files: $(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
