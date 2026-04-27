
# EDGEFOLIO VPS Server - Remote Monitoring & Backup Hub
**By Jenix** | Project: EDGEFOLIO | Version: 1.0.0

---

## Overview

The VPS (Virtual Private Server) is the **optional cloud companion** to the EDGEFOLIO Edge Node system. It provides:

- **Heartbeat Monitoring:** Track all deployed Edge nodes (employee attendance devices)
- **APK Hosting & Distribution:** Serve Android app to staff and field teams
- **OTA Updates:** Push app and system updates to Edge nodes
- **MongoDB Backup Storage:** Encrypted backup of attendance & payroll data
- **FRP Tunnel Management:** Secure reverse proxy tunneling (replacing Cloudflare)
- **Multi-Org Dashboard:** For resellers/franchises managing multiple deployments
- **Billing & Subscription:** Track paid tier customers and billing cycles
- **SMS/Notification Gateway:** Relay messages from offline-capable Edge nodes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      VPS (Cloud Server)                         │
│                    Ubuntu 22.04 LTS + MongoDB                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Node.js + PM2 Application Server             │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ Monitoring │  │ APK Hosting  │  │ Billing Engine  │  │  │
│  │  │ Dashboard  │  │ (Nginx CDN)  │  │ (Razorpay)      │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ Backup     │  │ Sync Service │  │ FRP Tunnel Mgr  │  │  │
│  │  │ Storage    │  │ (Delta Sync) │  │ (Reverse Proxy) │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │                                                          │  │
│  │              MongoDB Atlas / Local Instance              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                          ▼                                      │
│                   FRP Server (frps)                             │
│                Accepts tunnels from Edge nodes                 │
└──────────────────────────┬─────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     Edge Node 1     Edge Node 2    Edge Node N
   (Windows PC)     (Windows PC)   (Windows PC)
   Factory A        Factory B      Factory C
```

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Production-grade Linux server |
| Runtime | Node.js 20 LTS | Backend application server |
| Process Manager | PM2 | Keep app running, auto-restart, load balancing |
| Database | MongoDB 6+ | NoSQL storage for backups & metadata |
| Reverse Proxy | FRP (Fast Reverse Proxy) | Secure tunnel for Edge node communication |
| Web Server | Nginx | Static APK delivery, load balancing |
| Monitoring | Grafana + Prometheus | Real-time metrics & alerting |
| SSL/TLS | Let's Encrypt (Certbot) | Free automated certificates |

---

## Folder Structure

```
VPS/
├── config/                          # Configuration files
│   ├── frp-config.ini              # FRP server configuration
│   ├── mongodb-config.js           # MongoDB connection & schema
│   ├── pm2-config.js               # PM2 process manager config
│   └── nginx-config.conf           # Nginx reverse proxy setup
│
├── src/                             # Application source code
│   ├── server.js                   # Express app entry point
│   ├── index.js                    # Bootstrap & initialization
│   │
│   ├── controllers/                # Route handlers
│   │   ├── monitoringController.js # Edge node heartbeat & status
│   │   ├── apkController.js        # APK versioning & delivery
│   │   ├── backupController.js     # Backup upload & restore
│   │   └── billingController.js    # Subscription & invoicing
│   │
│   ├── models/                     # MongoDB schemas
│   │   ├── edgeNode.js             # Edge device metadata
│   │   ├── backup.js               # Backup file records
│   │   ├── subscription.js         # Billing subscriptions
│   │   └── heartbeat.js            # Health check logs
│   │
│   ├── services/                   # Business logic
│   │   ├── mongoService.js         # DB connection & queries
│   │   ├── syncService.js          # Delta sync logic
│   │   ├── notificationService.js  # Email/SMS alerts
│   │   └── frpTunnelService.js     # FRP tunnel management
│   │
│   ├── routes/                     # API endpoints
│   │   ├── monitoring.js           # GET /api/monitoring/*
│   │   ├── apk.js                  # GET /api/apk/*
│   │   ├── backup.js               # POST /api/backup/*
│   │   ├── sync.js                 # POST /api/sync/*
│   │   └── billing.js              # POST /api/billing/*
│   │
│   ├── middleware/                 # Express middleware
│   │   ├── auth.js                 # JWT / API key validation
│   │   ├── errorHandler.js         # Global error handling
│   │   └── rateLimiter.js          # Request throttling
│   │
│   └── utils/                      # Helper functions
│       ├── logger.js               # Structured logging
│       ├── encryption.js           # AES-256 encryption/decryption
│       └── validators.js           # Input validation schemas
│
├── migrations/                      # Database migrations
│   └── mongodb-migrations.js       # Schema versioning
│
├── dashboard/                       # Monitoring web UI
│   ├── public/                     # Static assets
│   │   └── index.html
│   └── src/                        # React/Vue components
│       ├── pages/
│       ├── components/
│       └── App.js
│
├── storage/                        # Data storage
│   ├── apk/                        # Versioned Android APK files
│   │   ├── edgefolio-v1.0.0.apk
│   │   └── edgefolio-v1.4.2.apk
│   └── backups/                    # Encrypted .pbbackup files
│       └── edge-node-001_2024-04.pbbackup
│
├── logs/                           # Application logs
│   ├── server.log
│   ├── sync.log
│   └── backup.log
│
├── package.json                    # Node.js dependencies
├── .env.example                    # Environment variables template
└── README.md                       # This file
```

---

## Installation & Setup

### 1. Prerequisites

- Ubuntu 22.04 LTS server (2GB RAM minimum, 20GB storage)
- Node.js 20 LTS
- MongoDB 6+ (local or Atlas)
- FRP server binary (`frps`)
- Nginx web server

### 2. Clone & Install

```bash
cd /opt/edgefolio-vps
git clone <repo-url> .
cp .env.example .env
nano .env  # Configure MongoDB URI, FRP token, etc.
npm install
```

### 3. MongoDB Setup

```bash
# Option A: MongoDB Atlas (Cloud)
# Create cluster at https://www.mongodb.com/cloud/atlas
# Copy connection string to .env

# Option B: Local MongoDB
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 4. FRP Tunnel Setup

```bash
# Download FRP server
wget https://github.com/fatedier/frp/releases/download/v0.53.0/frp_0.53.0_linux_amd64.tar.gz
tar -xzf frp_0.53.0_linux_amd64.tar.gz
sudo mv frp_0.53.0_linux_amd64 /opt/frp

# Copy config
sudo cp config/frp-config.ini /opt/frp/frps.ini
sudo /opt/frp/frps -c /opt/frp/frps.ini
```

### 5. Start Application

```bash
# Using PM2
npm install -g pm2
pm2 start config/pm2-config.js
pm2 save
pm2 startup

# Or using npm
npm start
```

---

## API Endpoints

### Monitoring (Edge Node Health Check)

```
POST   /api/v1/monitoring/heartbeat      Register/ping edge node
GET    /api/v1/monitoring/status         Get node status
GET    /api/v1/monitoring/nodes          List all nodes
GET    /api/v1/monitoring/alerts         Get active alerts
```

### APK Management

```
GET    /api/v1/apk/latest                Latest APK version metadata
GET    /api/v1/apk/download/:version     Download specific APK
POST   /api/v1/apk/upload                Upload new APK version (admin)
```

### Backup & Restore

```
POST   /api/v1/backup/upload             Upload encrypted backup from Edge
GET    /api/v1/backup/list               List all backups for org
GET    /api/v1/backup/download/:id       Download backup
POST   /api/v1/backup/restore            Trigger restore to Edge node
```

### Data Sync

```
POST   /api/v1/sync/push                 Push delta data to VPS
GET    /api/v1/sync/status               Last sync timestamp
POST   /api/v1/sync/metadata             Sync employee/shift metadata
```

### Billing (Subscription Management)

```
GET    /api/v1/billing/subscriptions     List org subscriptions
POST   /api/v1/billing/subscribe         Create new subscription
POST   /api/v1/billing/invoice           Generate invoice
GET    /api/v1/billing/usage             Calculate active members for month
```

---

## Environment Variables (.env)

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/edgefolio
MONGODB_DB=edgefolio_vps

# FRP Tunnel
FRP_SERVER_ADDR=0.0.0.0
FRP_SERVER_PORT=7000
FRP_AUTH_TOKEN=your-secure-token-here

# Encryption
ENCRYPTION_KEY=32-character-hex-key-here
AES_CIPHER=aes-256-gcm

# Backup Storage
BACKUP_STORAGE_PATH=/var/edgefolio/backups
MAX_BACKUP_SIZE_MB=500

# Monitoring
HEARTBEAT_TIMEOUT_MIN=5
ALERT_THRESHOLD_MB_FREE=1000

# Razorpay (Billing)
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-secret

# SMS Gateway (Notifications)
SMS_PROVIDER=fast2sms
SMS_API_KEY=your-api-key

# Admin
ADMIN_EMAIL=admin@edgefolio.com
ADMIN_PASSWORD_HASH=bcrypt-hash-here
```

---

## Deployment Checklist

- [ ] Ubuntu server provisioned with firewall rules
- [ ] Node.js 20 LTS installed
- [ ] MongoDB created (local or Atlas)
- [ ] FRP server configured and running
- [ ] Nginx configured for APK CDN
- [ ] `.env` file configured with secrets
- [ ] SSL certificates (Let's Encrypt)
- [ ] PM2 process file setup
- [ ] Database migrations run
- [ ] Monitoring dashboard accessible
- [ ] Backup directory with proper permissions
- [ ] Log rotation configured

---

## Monitoring & Alerts

### Key Metrics

- **Edge Nodes Offline:** Alert if heartbeat missing >5 min
- **Backup Stale:** Alert if last backup >7 days old
- **Storage Low:** Alert if disk <1GB free
- **Database Connection:** Monitor MongoDB latency
- **API Response Time:** Alert if p95 > 1000ms

### Access Monitoring Dashboard

```
https://your-vps-domain.com/dashboard
(Admin credentials from .env)
```

---

## Maintenance Tasks

### Daily

- Monitor edge node heartbeats
- Check backup completion status
- Review error logs

### Weekly

- Verify database backups
- Check FRP tunnel stability
- Review billing cycles

### Monthly

- Update dependencies (`npm audit fix`)
- Verify Razorpay sync
- Clean old logs (rotate)

---

## Troubleshooting

### Edge Node Not Connecting

```bash
# Check FRP server logs
tail -f /opt/frp/frps.log

# Verify tunnel configuration on Edge node
cat /path/to/frp-client-config.ini
```

### MongoDB Connection Failed

```bash
# Test connection
mongo --uri="mongodb+srv://user:pass@cluster.mongodb.net/test"

# Check VPS firewall
sudo ufw status
sudo ufw allow 27017
```

### APK Download Failing

```bash
# Verify Nginx is running
sudo systemctl status nginx

# Check APK storage directory
ls -lah /var/edgefolio/apk/
```

---

## Security Best Practices

1. **Firewall Rules:**
   - Port 22 (SSH): Restricted to admin IPs only
   - Port 80: HTTP redirect to HTTPS
   - Port 443: HTTPS for web & API
   - Port 7000: FRP server (internal LAN only)

2. **Database Security:**
   - MongoDB: Require authentication
   - Encrypt backups with user passphrase
   - Regular integrity checks

3. **Secrets Management:**
   - Use environment variables (never commit .env)
   - Rotate API keys quarterly
   - Enable 2FA for admin access

4. **Logging:**
   - Centralize logs (ELK stack optional)
   - Monitor for suspicious access patterns
   - Retain logs for 90 days minimum

---

## Support & Documentation

- **Project PRD:** `/smart_salary/EDGEFOLIO_System_PRD.md`
- **Issue Tracker:** GitHub Issues
- **Documentation:** Wiki (TBD)
- **Contact:** support@edgefolio.com

---

**Last Updated:** April 2026  
**Project:** EDGEFOLIO v1.0.0  
**Status:** Development Phase 1
