module.exports = {
  apps: [{
    name: 'dominion-backend',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '900M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};