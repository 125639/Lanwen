const path = require('path');

const appRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'linguaflash',
      script: './server/index.js',
      cwd: appRoot,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 8770
      },
      log_file: path.join(appRoot, 'logs/combined.log'),
      out_file: path.join(appRoot, 'logs/out.log'),
      error_file: path.join(appRoot, 'logs/error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
