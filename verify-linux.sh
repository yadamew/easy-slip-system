#!/usr/bin/env bash
# Isolated Linux compatibility test; never copy .env or Windows node_modules.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
check_dir="$(mktemp -d /tmp/easy-slip-linux.XXXXXX)"
printf 'Linux check directory: %s\n' "$check_dir"
node_version="$(tr -d '\r\n' < "$project_dir/.node-version")"
curl --fail --location --max-time 120 "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz" -o "$check_dir/node.tar.xz"
mkdir "$check_dir/runtime" "$check_dir/app"
tar -xJf "$check_dir/node.tar.xz" -C "$check_dir/runtime" --strip-components=1
export PATH="$check_dir/runtime/bin:$PATH"
for file in package.json package-lock.json server.js slip-parser.js slip-amount.js slip-result.js slip-ocr.js slip-qr.js budget-plan.js lan-network.js ai-retry.js ai-retry.test.mjs slip-ocr.test.mjs slip-formats.test.mjs slip-regression.test.mjs verify-project.mjs verify-ui.mjs verify-ocr-memory.mjs setup-ocr.mjs; do cp "$project_dir/$file" "$check_dir/app/"; done
cp -R "$project_dir/ocr-data" "$project_dir/public" "$check_dir/app/"
cd "$check_dir/app"
npm ci --cache "$check_dir/npm-cache"
npm run setup:ocr
node --check server.js
npm test
node verify-ocr-memory.mjs
printf '\nPASS: isolated Linux Node/Express, sharp, QR, Tesseract and existing UI tests.\n'
