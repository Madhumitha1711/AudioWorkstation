#!/usr/bin/env bash
# build-wasm.sh
# Compiles daw-engine (Rust) to WebAssembly and copies the output
# into daw-frontend/public/wasm/ so the AudioWorklet can fetch it.
#
# Requirements:
#   • Rust + Cargo  (https://rustup.rs)
#   • wasm32-unknown-unknown target
#
# Usage:
#   chmod +x build-wasm.sh
#   ./build-wasm.sh
#
# After first run, just `cargo build` in daw-engine/ and re-run the cp step.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Ensure wasm32 target is installed ──────────────────────────────────────
echo "→ Checking wasm32-unknown-unknown target…"
rustup target add wasm32-unknown-unknown

# ── 2. Build in release mode ──────────────────────────────────────────────────
echo "→ Building daw-engine (release)…"
cd "$SCRIPT_DIR/daw-engine"
cargo build --target wasm32-unknown-unknown --release

# ── 3. Copy the .wasm binary to the frontend public/ directory ────────────────
WASM_OUT="$SCRIPT_DIR/daw-engine/target/wasm32-unknown-unknown/release/daw_engine.wasm"
DEST_DIR="$SCRIPT_DIR/daw-frontend/public/wasm"

mkdir -p "$DEST_DIR"
cp "$WASM_OUT" "$DEST_DIR/daw_engine.wasm"

echo ""
echo "✓ Done!  Copied daw_engine.wasm → daw-frontend/public/wasm/"
echo ""
echo "  File size: $(du -sh "$DEST_DIR/daw_engine.wasm" | cut -f1)"
echo ""
echo "  Now run:  cd daw-frontend && npm run dev"
echo "  Open Chapter 06 — SIZE, DECAY, DAMPING, DIFFUSION knobs will be live."
