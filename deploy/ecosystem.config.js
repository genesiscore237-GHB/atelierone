module.exports = {
  apps: [{
    name: "atelierone",
    cwd: "/opt/atelierone/apps/nextjs",
    script: "npm",
    args: "start",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "1G",
    watch: false,
    error_file: "/var/log/atelierone/error.log",
    out_file: "/var/log/atelierone/out.log",
    time: true,
  }],
};