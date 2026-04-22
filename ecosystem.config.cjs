module.exports = {
  apps: [
    {
      name: 'linguaflash',
      script: './server/index.js',
      cwd: '/root/english',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 80
      },
      log_file: '/root/english/logs/combined.log',
      out_file: '/root/english/logs/out.log',
      error_file: '/root/english/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
