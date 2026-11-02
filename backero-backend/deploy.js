#!/usr/bin/env node
/**
 * GitHub Webhook Deployment Script
 * Listens for GitHub push events and automatically:
 * 1. Pulls latest code from GitHub
 * 2. Installs dependencies
 * 3. Restarts the Node.js backend process
 * 4. Verifies the service is running
 */

const express = require('express');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.DEPLOY_PORT || 3001;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-github-webhook-secret';
const PROJECT_DIR = process.env.PROJECT_DIR || __dirname;

app.use(express.json());

// Verify GitHub webhook signature
function verifyGitHubSignature(req, secret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const hash = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const expected = `sha256=${hash}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Webhook endpoint
app.post('/webhook/github', (req, res) => {
  console.log('[Deploy] Received GitHub webhook');

  // Verify signature
  if (!verifyGitHubSignature(req, WEBHOOK_SECRET)) {
    console.error('[Deploy] Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only deploy on push to main branch
  if (req.body.ref !== 'refs/heads/main') {
    console.log(`[Deploy] Ignoring push to ${req.body.ref} (not main)`);
    return res.status(200).json({ message: 'Ignoring non-main branch' });
  }

  console.log('[Deploy] Valid webhook received for main branch');
  res.status(200).json({ message: 'Deployment started' });

  // Run deployment in background
  setTimeout(() => {
    deploySafely();
  }, 1000);
});

// Health check endpoint
app.get('/health/deploy', (req, res) => {
  res.json({ status: 'ok', service: 'deployment-webhook' });
});

// Deployment function
function deploySafely() {
  console.log('[Deploy] Starting deployment...');

  try {
    // 1. Pull latest code
    console.log('[Deploy] Pulling latest code from GitHub...');
    execSync('git pull origin main', { cwd: PROJECT_DIR, stdio: 'inherit' });
    console.log('[Deploy] ✓ Code pulled successfully');

    // 2. Install dependencies
    console.log('[Deploy] Installing dependencies...');
    execSync('npm install --production', { cwd: PROJECT_DIR, stdio: 'inherit' });
    console.log('[Deploy] ✓ Dependencies installed');

    // 3. Restart the service
    console.log('[Deploy] Restarting backend service...');
    restartService();

    // 4. Verify service is running
    setTimeout(() => {
      verifyService();
    }, 3000);

  } catch (error) {
    console.error('[Deploy] Deployment failed:', error.message);
    notifyDeploymentFailure(error);
  }
}

// Restart the backend service
function restartService() {
  try {
    // Try PM2 first
    try {
      execSync('pm2 restart backero-backend', { stdio: 'inherit' });
      console.log('[Deploy] ✓ Restarted via PM2');
      return;
    } catch (e) {
      // PM2 not available, try next method
    }

    // Try systemd
    try {
      execSync('systemctl restart backero-backend', { stdio: 'inherit' });
      console.log('[Deploy] ✓ Restarted via systemd');
      return;
    } catch (e) {
      // systemd not available, try next method
    }

    // Kill and restart node process
    console.log('[Deploy] Killing existing node processes...');
    try {
      execSync('pkill -f "node server.js"', { stdio: 'pipe' });
    } catch (e) {
      // No process found, that's ok
    }

    console.log('[Deploy] Starting backend service...');
    exec('cd ' + PROJECT_DIR + ' && npm run dev > /tmp/backero-backend.log 2>&1 &');
    console.log('[Deploy] ✓ Service started');

  } catch (error) {
    console.error('[Deploy] Failed to restart service:', error.message);
    throw error;
  }
}

// Verify service is running
function verifyService() {
  exec('curl -s http://localhost:5000/health', (error, stdout, stderr) => {
    if (error) {
      console.error('[Deploy] ✗ Service health check failed:', error.message);
      return;
    }

    try {
      const health = JSON.parse(stdout);
      if (health.status === 'ok') {
        console.log('[Deploy] ✓ Backend service is healthy');
        console.log('[Deploy] ✓ Deployment completed successfully!');
      } else {
        console.error('[Deploy] ✗ Backend unhealthy:', health);
      }
    } catch (e) {
      console.error('[Deploy] ✗ Invalid health response');
    }
  });
}

// Notify on failure (optional - can integrate with Slack, email, etc)
function notifyDeploymentFailure(error) {
  console.error('[Deploy] Deployment failed - manual intervention needed');
  console.error('[Deploy] Error:', error.message);
  // TODO: Add Slack/email notification here
}

// Start webhook server
app.listen(PORT, () => {
  console.log(`[Deploy] Webhook server listening on port ${PORT}`);
  console.log('[Deploy] GitHub webhook should POST to: http://your-vps-ip:' + PORT + '/webhook/github');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Deploy] Webhook server shutting down...');
  process.exit(0);
});
