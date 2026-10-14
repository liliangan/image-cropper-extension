#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

npm run build --silent
node --check popup.js
node --check popup.bundle.js
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
  camera.html \
  camera.css \
  camera.js \
  background-removal-sandbox.html \
  background-removal-sandbox.js \
  popup.bundle.js \
  background-removal-sandbox.bundle.js \
  bundle.chunk-*.js \
  package.json \
  package-lock.json \
  package_extension.sh \
  README.md \
  LICENSE \
  icon-16.png \
  icon-32.png \
  icon-48.png \
  icon-128.png \
  _locales/zh_CN/messages.json \
  vendor/cropper.min.css \
  vendor/cropper.min.js \
  runtime/onnxruntime-web/ort-wasm-simd-threaded.mjs \
  runtime/onnxruntime-web/ort-wasm-simd-threaded.wasm \
  THIRD_PARTY_NOTICES.md

unzip -tq "$output"
printf 'Created %s\n' "$output"
