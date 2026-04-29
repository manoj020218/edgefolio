# EDGEFOLIO Installation Guide

Last updated: April 27, 2026

## 1. Prerequisites

Required:
- Node.js 20+
- npm 9+

Optional:
- Python 3.10+ (for local face service)

## 2. Project setup

From repository root:

```bash
cd EDGE
npm install
```

Initialize local database:

```bash
npm run init-db
```

This creates:
- `storage/database/edgefolio.db`
- schema + seed data

## 3. Run backend only

```bash
npm run backend
```

Backend default URL:
- `http://127.0.0.1:7001/api/v1`

## 4. Run full desktop development stack

```bash
npm run dev:stack
```

This starts:
- Backend (`backend/index.js`)
- Frontend Vite dev server
- Electron app shell

## 5. Build desktop executable

```bash
npm run build:exe
```

Output is generated in:
- `dist-exe/`

## 6. Utility scripts

Initialize DB and print table summary:

```bash
npm run init-db
```

Generate onboarding QR code:

```bash
npm run generate:qr
```

Custom text/output:

```bash
node scripts/generate-qr-code.js --text "http://127.0.0.1:7001/api/v1/health" --out "./storage/documents/my-qr.png"
```

One-shot bootstrap script (Linux/macOS shell):

```bash
bash scripts/setup.sh
```

## 7. Optional Python face service

Self-test:

```bash
python python/face_recognition_service.py --test
```

Run service:

```bash
python python/face_recognition_service.py --host 127.0.0.1 --port 7080
```

Health endpoint:

```bash
curl http://127.0.0.1:7080/health
```

## 8. Log files

Backend writes structured logs to:
- `logs/server.log`
- `logs/error.log`
- `logs/sync.log` (sync flow)
- `logs/backup.log` (backup flow)
- `logs/face-recognition.log` (reserved for face events)

## 9. Troubleshooting

Port already in use:

```bash
# Windows
netstat -ano | findstr :7001
```

Clean install:

```bash
rm -rf node_modules package-lock.json
npm install
```

Reset local DB:

```bash
rm -f storage/database/edgefolio.db storage/database/edgefolio.db-shm storage/database/edgefolio.db-wal
npm run init-db
```
