module.exports = {
  apps: [
    {
      name: 'edgefolio-marketing',
      script: '/root/projects/public-credit/edgefolio/marketing/server.js',
      cwd: '/root/projects/public-credit/edgefolio/marketing',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3080,
      },
      error_file: '/var/log/edgefolio/marketing-error.log',
      out_file: '/var/log/edgefolio/marketing-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
