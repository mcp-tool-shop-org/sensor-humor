#!/usr/bin/env bash
set -euo pipefail

echo "=== sensor-humor verify ==="

echo "[1/3] TypeScript compile..."
npx tsc --noEmit

echo "[2/3] Tests..."
npm test

echo "[3/3] Build..."
npm run build

echo "=== All checks passed ==="
