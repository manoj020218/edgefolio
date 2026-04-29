# EDGEFOLIO Runtime Storage

This directory is intentionally runtime-driven.

Subfolders:
- `database/` - SQLite database files (`edgefolio.db`, WAL/SHM files)
- `backups/` - Local backup exports (`.pbbackup`)
- `documents/` - Generated or uploaded documents
- `face-templates/` - Reserved for encrypted biometric template assets

Most files are created only after the app is used.
