#!/bin/bash
# Run from: tneb-policy-assistant/frontend/

set -e

echo "=== TNEB PolicyAI — Frontend Setup ==="

if ! command -v node &> /dev/null; then
  echo "Node.js not found. Please install Node.js 18+ from https://nodejs.org"
  exit 1
fi

echo "Installing npm packages..."
npm install

echo "Starting dev server at http://localhost:5173"
npm run dev
