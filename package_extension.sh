#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"

version=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")
output="dist/image-cropper-extension-v${version}.zip"

mkdir -p dist
rm -f "$output"

zip -q "$output" \
  manifest.json \
  popup.html \
  popup.css \
  popup.js \
  icon-16.png \
  icon-32.png \
  icon-48.png \
  icon-128.png \
  _locales/zh_CN/messages.json \
  vendor/cropper.min.css \
  vendor/cropper.min.js \
  THIRD_PARTY_NOTICES.md

unzip -tq "$output"
printf 'Created %s\n' "$output"
