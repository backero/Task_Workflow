# Automated Deployment Setup

This guide explains how to set up automatic backend deployment on your VPS using GitHub webhooks.

## What It Does

When you push code to GitHub's `main` branch:
1. GitHub sends a webhook notification to your VPS
2. The VPS automatically pulls the latest code
3. Dependencies are installed
4. The backend service restarts
5. Service health is verified

## Prerequisites

- VPS running Node.js and npm
- Backend code deployed to `/var/www/backero-backend` (or similar)
- SSH access to your VPS
- GitHub repository with webhook access

## Setup Steps

### 1. On Your VPS

#### Step A: Create a GitHub Webhook Secret
```bash
# Generate a random secret (save this, you'll need it for GitHub)
openssl rand -base64 32
# Example output: AbCd1234EfGh5678+jKlMnOpQrStUv==
```

#### Step B: Set Environment Variables
SSH into your VPS and add to your shell profile:

```bash
# Edit ~/.bashrc or ~/.zshrc
export GITHUB_WEBHOOK_SECRET="AbCd1234EfGh5678+jKlMnOpQrStUv=="
export DEPLOY_PORT=3001
export PROJECT_DIR=/var/www/backero-backend
```

Then reload:
```bash
source ~/.bashrc
# or
source ~/.zshrc
```

#### Step C: Start the Deployment Webhook Service

Option 1: Using PM2 (Recommended)
```bash
cd /var/www/backero-backend
pm2 start deploy.js --name "backero-deploy"
pm2 save
pm2 startup
```

Option 2: Using systemd
Create `/etc/systemd/system/backero-deploy.service`:
```ini
[Unit]
Description=Backero Backend Deployment Webhook
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/backero-backend
ExecStart=/usr/bin/node /var/www/backero-backend/deploy.js
Restart=on-failure
RestartSec=10
Environment="GITHUB_WEBHOOK_SECRET=AbCd1234EfGh5678+jKlMnOpQrStUv=="
Environment="DEPLOY_PORT=3001"
Environment="PROJECT_DIR=/var/www/backero-backend"

[Install]
WantedBy=multi-user.target
```

Then:
```bash
systemctl daemon-reload
systemctl enable backero-deploy
systemctl start backero-deploy
systemctl status backero-deploy
```

### 2. On GitHub

#### Step A: Get Your VPS IP
```bash
# On your VPS
curl https://api.ipify.org
# Example: 203.0.113.45
```

#### Step B: Add GitHub Webhook
1. Go to: https://github.com/backero/Task_Workflow/settings/hooks
2. Click "Add webhook"
3. **Payload URL**: `http://203.0.113.45:3001/webhook/github` (replace IP)
4. **Content type**: `application/json`
5. **Secret**: Paste the secret you generated (AbCd1234EfGh5678+jKlMnOpQrStUv==)
6. **Events**: Select "Push events"
7. **Active**: Check ✓
8. Click "Add webhook"

#### Step C: Test the Webhook
Click the webhook in GitHub settings → "Recent Deliveries" tab → click the most recent → "Redeliver"

You should see:
- Green checkmark ✓
- Response status `200`
- Response body: `{"message":"Deployment started"}`

## Verification

### Check if deployment webhook is running
```bash
# PM2
pm2 list
# or
pm2 logs backero-deploy

# Systemd
systemctl status backero-deploy
journalctl -u backero-deploy -f
```

### Check if backend restarted
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok",...}
```

### Check deployment logs
```bash
tail -f /tmp/backero-backend.log
```

## Testing

Push a test commit to `main`:
```bash
cd /your/local/repo
git commit --allow-empty -m "Test: Trigger deployment webhook"
git push origin main
```

Then check the webhook logs on GitHub (Recent Deliveries) and your VPS logs.

## Troubleshooting

### Webhook not triggering
- Check GitHub webhook in https://github.com/backero/Task_Workflow/settings/hooks
- Verify the IP and port are correct
- Check firewall: `sudo ufw allow 3001`
- Test with: `curl http://your-vps-ip:3001/health/deploy`

### Signature verification failing
- Make sure `GITHUB_WEBHOOK_SECRET` env var matches GitHub webhook secret exactly
- Copy-paste both to avoid typos

### Service not restarting
- Check if PM2 or systemd is running the webhook service
- Verify git is installed: `which git`
- Test git pull manually: `cd /var/www/backero-backend && git pull origin main`

### Backend service crashing
- Check logs: `journalctl -u backero-backend -f` or `pm2 logs backero-backend`
- Verify dependencies installed: `npm install --production`
- Check for port conflicts: `lsof -i :5000`

## Manual Deployment (if webhook fails)

SSH into VPS and run:
```bash
cd /var/www/backero-backend
git pull origin main
npm install --production
pm2 restart backero-backend  # or: systemctl restart backero-backend
pm2 logs backero-backend  # Check if it started successfully
```

## Security Notes

- The webhook secret prevents anyone from triggering deployments
- Keep the secret safe - don't commit it to git
- Only allows deployments when pushing to `main` branch
- Consider firewall rules to limit which IPs can access port 3001

## Next Steps

Once set up, every push to `main` will:
1. ✅ Automatically pull latest code
2. ✅ Install dependencies
3. ✅ Restart the backend
4. ✅ Verify it's healthy

No manual restarts needed! 🚀
