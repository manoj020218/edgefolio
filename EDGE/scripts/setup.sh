#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "EDGEFOLIO setup started"
echo "Project root: ${ROOT_DIR}"

mkdir -p "${ROOT_DIR}/storage/database"
mkdir -p "${ROOT_DIR}/storage/backups"
mkdir -p "${ROOT_DIR}/storage/documents"
mkdir -p "${ROOT_DIR}/storage/face-templates"
mkdir -p "${ROOT_DIR}/logs"
mkdir -p "${ROOT_DIR}/python/models"

if [[ ! -f "${ROOT_DIR}/backend/config/.env" && -f "${ROOT_DIR}/backend/config/.env.example" ]]; then
  cp "${ROOT_DIR}/backend/config/.env.example" "${ROOT_DIR}/backend/config/.env"
  echo "Created backend/config/.env from .env.example"
fi

echo "Installing Node dependencies"
cd "${ROOT_DIR}"
npm install

echo "Initializing SQLite database"
node scripts/init-database.js

echo "Generating default onboarding QR"
node scripts/generate-qr-code.js

echo "EDGEFOLIO setup completed successfully"
