#!/bin/bash
# Run from: tneb-policy-assistant/backend/

set -e

echo "=== TNEB PolicyAI — Backend Setup ==="

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env — please add your GEMINI_API_KEY to .env before running."
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
echo "Installing dependencies..."
pip install -r requirements.txt --quiet

echo "Starting server at http://localhost:8000"
echo "API docs at http://localhost:8000/docs"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
