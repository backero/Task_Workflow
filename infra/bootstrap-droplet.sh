#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 Droplet that will host the
# backero-backend API container plus Nginx serving the backero-frontend
# static build. Run once, as root (or via sudo), right after the Droplet is
# created and you've SSH'd in for the first time.
#
# Usage: ssh into the Droplet, then:
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/infra/bootstrap-droplet.sh | sudo bash
# or copy this file up and run it directly.
set -euo pipefail

echo "==> Updating apt and installing base packages"
apt-get update
apt-get install -y ca-certificates curl gnupg ufw

echo "==> Installing Docker Engine + Compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "==> Installing Nginx + Certbot"
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Configuring firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Creating app directories"
mkdir -p /opt/backero/backend
mkdir -p /opt/backero/frontend/dist
mkdir -p /opt/backero/backend/logs
mkdir -p /opt/backero/backend/reports

echo "==> Done. Next steps:"
echo "  1. Copy backero-backend/ into /opt/backero/backend (git clone or CI deploy)."
echo "  2. Place a real .env.production in /opt/backero/backend (never commit it)."
echo "  3. Copy infra/nginx.conf.template to /etc/nginx/sites-available/backero,"
echo "     substitute API_DOMAIN/APP_DOMAIN, symlink into sites-enabled, nginx -t, reload."
echo "  4. Run: certbot --nginx -d <API_DOMAIN> -d <APP_DOMAIN>"
echo "  5. cd /opt/backero/backend && docker compose -f docker-compose.prod.yml up -d --build"
