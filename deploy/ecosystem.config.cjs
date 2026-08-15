// 蛮有味后端 pm2 部署配置（W7 · 2026-08-15）
// 用法：pm2 start deploy/ecosystem.config.cjs
// 依赖：.env 已配置（AUTH_JWT_SECRET / DEEPSEEK_API_KEY / AMAP_SERVER_KEY / AUTH_DATA_KEY / ADMIN_TOKEN / ALLOWED_ORIGINS 等）
module.exports = {
  apps: [
    {
      name: 'manyouwei-backend',
      script: 'hypha/implementation/src/httpServer.js',
      cwd: __dirname + '/..',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        MYWO_PORT: 8799,
        MYWO_DATASOURCE: 'wuhan',
      },
      out_file: '/tmp/manyouwei-out.log',
      error_file: '/tmp/manyouwei-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
