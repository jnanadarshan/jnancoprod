#!/usr/bin/env bash
# Builds font.wasm for the Displaysim PWA. Needs Go 1.22+ and network access for golang.org/x/image.
set -euo pipefail
cd "$(dirname "$0")"
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o font.wasm .
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" wasm_exec.js
ls -la font.wasm wasm_exec.js
