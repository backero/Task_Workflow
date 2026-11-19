const path = require('path');
const windows = process.platform === 'win32';

const publisherPlatforms = ['amazon', 'flipkart', 'meesho', 'snapdeal'];
const pythonFor = (platform) => path.join(__dirname, platform === 'amazon' ? 'flipkart' : platform, 'venv', windows ? 'Scripts' : 'bin', windows ? 'python.exe' : 'python');

module.exports = {
  apps: [
    {
      name: 'amazon-seller-browser',
      script: path.join(__dirname, 'amazon', 'browser_collector.cjs'),
      interpreter: 'node', args: ['--watch'], cwd: __dirname,
      autorestart: true, restart_delay: 5000, max_restarts: 10, min_uptime: '10s',
      env: { AMAZON_BROWSER_SESSION: 'amazon-seller-connect', AMAZON_BROWSER_POLL_SECONDS: '900' },
    },
    ...publisherPlatforms.map((platform) => ({
    name: `marketplace-mirror-${platform}`,
    script: path.join(__dirname, 'publish_mirror.py'),
    interpreter: pythonFor(platform),
    args: ['--platform', platform, '--watch'],
    cwd: __dirname,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    env: { PYTHONUNBUFFERED: '1' },
    })),
  ],
};
