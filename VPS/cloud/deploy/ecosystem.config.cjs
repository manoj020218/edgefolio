// PM2 process for EdgeFolio Cloud. Paths are relative to this file, so the same config works in
// any checkout location (shared VPS today, another server later).
const path = require('path');
const root = path.join(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'edgefolio-cloud',
      script: path.join(root, 'src', 'index.js'),
      cwd: root,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // The shared VPS has ~600 MB free: cap the heap and restart before it can crowd others.
      node_args: '--max-old-space-size=160',
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },   // everything else comes from VPS/cloud/.env
      time: true,
    },
  ],
};
