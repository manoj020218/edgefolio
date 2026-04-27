# EDGEFOLIO

> Offline-first Payroll & Attendance Management for Indian SMEs and Factories

**Website:** https://edgefolio.iotsoft.in  
**Latest Release:** [v1.0.0-alpha](https://github.com/manoj020218/edgefolio/releases/tag/v1.0.0-alpha)

---

## What is EDGEFOLIO?

EDGEFOLIO is a local-first (edge-computing) payroll and attendance system that runs entirely on your Windows PC — no cloud subscription, no internet required for core operations. It is built for Indian SMEs, factories, and businesses that need rock-solid payroll and attendance tracking even during internet outages.

## Architecture

```
Phase 1 (Current): Frontend UI — React 18 + Vite + Tailwind CSS
Phase 2 (Planned): Backend    — Node.js + Express + SQLite (offline)
Phase 3 (Planned): Cloud      — VPS sync, MongoDB, FRP tunnel, billing
```

## Quick Start

```bash
git clone https://github.com/manoj020218/edgefolio.git
cd edgefolio/EDGE/frontend
npm install
npm run dev
```

Open http://localhost:5173  
Login: `admin@edgefolio.com` / `password` · 2FA: `123456`

## Features

- Offline-first — works without internet
- Face recognition attendance (Phase 2)
- Smart payroll engine (PF, ESI, PT, TDS, OT)
- 10 modules: Dashboard, Attendance, Employees, Payroll, Reports, Leave, Cashbook, Settings, Backup
- Optional cloud sync to VPS (Phase 3)
- Android companion app (Phase 2)
- India-first: INR, Indian compliance, Indian date formats

## Project Structure

```
EdgeFolio/
├── EDGE/
│   ├── frontend/          React 18 + Vite + Tailwind UI
│   ├── backend/           Node.js + Express + SQLite (Phase 2)
│   └── mobile-app/        Android companion (Phase 2)
├── VPS/
│   ├── marketing/         Landing page (edgefolio.iotsoft.in)
│   ├── src/               VPS backend (Phase 3)
│   └── config/            Nginx + PM2 configs
└── releases/              Version history and release notes
```

## Releases

See [releases/VERSIONS.md](releases/VERSIONS.md) for the full version history.

| Version | Status | Details |
|---|---|---|
| v1.0.0-alpha | ✅ Released | Full UI, all 10 pages, mock data |
| v1.1.0-beta | ⏳ Planned | SQLite backend, real auth |
| v2.0.0 | ⏳ Planned | Cloud sync, VPS integration |

## Requirements

- Windows 10/11 (also works on macOS/Linux)
- Node.js 18+
- 2 GB RAM minimum

## License

MIT — free to use, modify, and distribute.

---

**By Jenix** · [edgefolio.iotsoft.in](https://edgefolio.iotsoft.in) · [Issues](https://github.com/manoj020218/edgefolio/issues)
