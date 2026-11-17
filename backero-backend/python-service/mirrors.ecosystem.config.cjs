const path = require('path');
const windows = process.platform === 'win32';

module.exports = {
  apps: ['flipkart', 'meesho', 'snapdeal'].map((platform) => ({
    name: `marketplace-mirror-${platform}`,
    script: path.join(__dirname, 'publish_mirror.py'),
    interpreter: path.join(__dirname, platform, 'venv', windows ? 'Scripts' : 'bin', windows ? 'python.exe' : 'python'),
    args: ['--platform', platform, '--watch'],
    cwd: __dirname,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    env: { PYTHONUNBUFFERED: '1' },
  })),
};
