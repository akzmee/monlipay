# VPS Deployment Guide

This guide explains how to self-host MonliPay on your own VPS, running
**both testnet and mainnet instances** behind a single nginx/Caddy reverse
proxy.

```
                    ┌──────────────────────────┐
                    │      Your VPS            │
                    │                          │
  monlipay.xyz ────►│  nginx/caddy :443        │
                    │     │                    │
                    │     ▼                    │
                    │  docker monlipay-mainnet │──► Monad Mainnet (143)
                    │     :4000                │
                    │                          │
testnet.monlipay.xyz│     │                    │
               ────►│     ▼                    │
                    │  docker monlipay-testnet │──► Monad Testnet (10143)
                    │     :3000                │
                    └──────────────────────────┘
```

---

## Architecture

| Component | Port | Purpose |
|---|---|---|
| `monlipay-testnet` container | 127.0.0.1:3000 | Next.js standalone server, configured for chain 10143 |
| `monlipay-mainnet` container | 127.0.0.1:4000 | Next.js standalone server, configured for chain 143 |
| nginx OR Caddy | 80, 443 | Public reverse proxy with HTTPS termination |

Both containers bind to **loopback only** (`127.0.0.1`) — they're not
directly reachable from the internet. Only the reverse proxy exposes them.

---

## Prerequisites

- A VPS with at least **1 vCPU, 1GB RAM, 10GB disk** (the Docker images are ~180MB each)
- A domain `monlipay.xyz` (or your domain) with DNS records:
  ```
  monlipay.xyz            A   <your VPS IP>
  testnet.monlipay.xyz    A   <your VPS IP>
  www.monlipay.xyz        A   <your VPS IP>
  ```
- Docker 24+ and Docker Compose v2 plugin
- nginx OR Caddy (for HTTPS termination)
- Foundry (only needed if deploying the contract from the VPS)

---

## Setup — First time

### 1. Install Docker on the VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out + back in for group change to take effect
```

### 2. Clone the repo

```bash
cd ~
git clone https://github.com/akzmee/monlipay.git
cd monlipay
git checkout main   # mainnet deployment
# or: git checkout testnet  for testnet-only
```

### 3. Create `.env.deploy` (secrets)

```bash
cp .env.deploy.example .env.deploy
nano .env.deploy
```

Fill in real values:

```bash
NEXT_PUBLIC_WC_PROJECT_ID=51b6811b42a9013acdff21814cdf58cb
TESTNET_LINK_VAULT_ADDRESS=0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3
MAINNET_LINK_VAULT_ADDRESS=0x0000000000000000000000000000000000000000
# Leave mainnet as zero until you deploy the contract to mainnet
LIFI_API_KEY=your_lifi_key
ALCHEMY_API_KEY=your_alchemy_key
```

**IMPORTANT:** `.env.deploy` is gitignored — never commit it.

### 4. Build + start containers

```bash
./deploy/deploy.sh --no-pull
```

First build takes 3-5 minutes (npm install + Next.js build). Subsequent
builds use Docker layer cache and complete in under 1 minute.

Verify both containers are healthy:

```bash
docker compose ps
curl -sI http://localhost:3000/ | head -1   # → 200 OK
curl -sI http://localhost:4000/ | head -1   # → 200 OK
```

### 5. Set up the reverse proxy

You have two choices. **Caddy is recommended** if you're starting fresh
(automatic HTTPS, simpler config). **nginx** is fine if your VPS already
uses it.

#### Option A — Caddy (recommended, simplest)

```bash
# Install
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Copy config
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy will automatically fetch Let's Encrypt certificates for both
`monlipay.xyz` and `testnet.monlipay.xyz` on first run.

#### Option B — nginx + certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx/monlipay.conf /etc/nginx/sites-available/monlipay
sudo ln -s /etc/nginx/sites-available/monlipay /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificates
sudo certbot --nginx -d monlipay.xyz -d www.monlipay.xyz -d testnet.monlipay.xyz
```

### 6. Verify

Visit:
- **https://testnet.monlipay.xyz** → should show the app, wallet connects to chain 10143
- **https://monlipay.xyz** → should show the app, wallet connects to chain 143

---

## Deploying the smart contract

The contract on testnet is already deployed at `0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3`.
For mainnet, you need to deploy it yourself.

### Testnet (already done, included here for reference)

```bash
DEPLOYER_PRIVATE_KEY=0x... ./deploy/contract.sh testnet
```

### Mainnet

```bash
# Make sure your deployer wallet has MON for gas
DEPLOYER_PRIVATE_KEY=0x... ./deploy/contract.sh mainnet
```

The script will:
1. Prompt for confirmation (it's real money)
2. Check wallet balance
3. Deploy + verify on Sourcify
4. Auto-update `.env.deploy` with the new address
5. Tell you to run `./deploy/deploy.sh --no-pull` to rebuild containers

---

## Daily operations

### Update the app after pushing code

```bash
cd ~/monlipay
./deploy/deploy.sh              # pulls latest + rebuilds + restarts
```

### View logs

```bash
docker compose logs -f monlipay-testnet   # testnet container logs
docker compose logs -f monlipay-mainnet   # mainnet container logs
```

### Restart without rebuilding

```bash
docker compose restart
```

### Stop everything

```bash
docker compose down
```

### Renew SSL certificates

Caddy handles this automatically. For nginx + certbot:

```bash
sudo certbot renew --dry-run   # test
sudo certbot renew             # actual renewal (usually a systemd timer does this)
```

---

## Troubleshooting

### Containers won't start

```bash
docker compose logs monlipay-testnet | tail -30
docker compose logs monlipay-mainnet | tail -30
```

Common causes:
- `.env.deploy` missing required keys → script will tell you
- Port 3000/4000 already in use → `sudo lsof -i :3000` to find what
- Out of memory → `docker stats` to see usage

### Browser shows "contract not deployed"

You forgot to set the contract address in `.env.deploy`:

```bash
grep LINK_VAULT_ADDRESS .env.deploy
```

If `MAINNET_LINK_VAULT_ADDRESS` is `0x0000...0`, deploy the contract first.

### Wallet connects to wrong chain

Make sure you're visiting the right domain:
- `monlipay.xyz` → mainnet (chain 143)
- `testnet.monlipay.xyz` → testnet (chain 10143)

Each container is built with `NEXT_PUBLIC_NETWORK` baked in, so it's
impossible for them to mix up chains.

### Bridge page not working

Check the server-side API keys:

```bash
grep -E "LIFI_API_KEY|ALCHEMY_API_KEY" .env.deploy
```

These are required for `/api/bridge/*` routes to work. The bridge feature
is optional — the core payment-link flow works without it.

---

## Security notes

- `.env.deploy` is gitignored and should **never** be committed. If you
  accidentally commit it, rotate all API keys immediately.
- The Docker containers run as a non-root user (`nextjs`).
- Both app containers bind to `127.0.0.1` only — they're not reachable
  from the internet, only through the reverse proxy.
- nginx config includes rate limiting on `/api/bridge/*` endpoints to
  protect the LiFi/Alchemy API keys from abuse.
- HTTPS is mandatory (HTTP requests are redirected to HTTPS).
- HSTS header is set with `preload` — once active, browsers will refuse
  to connect over HTTP for 2 years.

---

## Updating this guide

If you change the architecture, ports, or domain strategy, update:
1. This file (`DEPLOY-VPS.md`)
2. `deploy/deploy.sh` (if ports / healthcheck URLs change)
3. `deploy/nginx/monlipay.conf` or `deploy/caddy/Caddyfile`
4. `docker-compose.yml` comments
