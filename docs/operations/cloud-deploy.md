# Cloud Deployment Guide — EC2 / GCP VM + Cloudflare Tunnel

**Target:** Cloud VM (AWS EC2 or Google Compute Engine), Ubuntu 24.04 LTS
**Ingress:** Cloudflare Tunnel only — no public ports on the server
**Stack:** Docker Compose (`docker-compose.prod.yml`) → Caddy (`:80`) → Next.js & FastAPI → PostgreSQL 16 + pgvector

```
Internet → Cloudflare Edge (SSL, DDoS) → cloudflared container → Caddy :80 → backend:8000 / frontend:3000
```

---

## 1. Provision the VM

| Item | Recommendation |
|------|----------------|
| Machine type | 2 vCPU / 4 GB RAM (e.g. AWS `t3.medium`, GCP `e2-standard-2`) |
| Disk | 30–50 GB SSD (GP3 / standard persistent) |
| OS | Ubuntu 24.04 LTS |
| Region | Closest to users: GCP `me-central2` (Dammam) or AWS `me-south-1` (Bahrain) |
| Firewall | Allow **only SSH (22)** from your IP. Ports 80/443 stay closed — Cloudflare Tunnel needs no inbound ports. |

Free tier (1 GB RAM) can work for very low load, but Postgres + two app containers are tight — 4 GB is safer.

## 2. Install Docker

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so the `docker` group takes effect.

## 3. Get the code and configure secrets

```bash
git clone https://github.com/Mahbob25/ILMS-IERP.git lms
cd lms
cp .env.example .env
```

Edit `.env`:

- `POSTGRES_PASSWORD` — strong random password
- `JWT_SECRET_KEY` — generate: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `TUNNEL_TOKEN` — from step 4
- `SENTRY_DSN` — leave empty if not used

## 4. Create the Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. Choose **Cloudflared**; copy the token into `.env` → `TUNNEL_TOKEN`
3. Add a **Public Hostname**:
   - Subdomain/domain: `aldrasat.edu`
   - Service type: `HTTP`
   - URL: `caddy:80` (Docker service name)
4. Ensure `aldrasat.edu` is on Cloudflare DNS (orange-cloud / proxied)

## 5. Deploy

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

This builds images, runs `alembic upgrade head`, starts services, and waits for healthchecks. For subsequent updates: run `./scripts/deploy.sh` again (it pulls, rebuilds, migrates, and recreates containers).

## 6. Verify

```bash
curl -fsS https://aldrasat.edu/api/v1/health      # backend health
docker compose -f docker-compose.prod.yml ps      # all containers Up
```

- Frontend: `https://aldrasat.edu/ar/login`
- Uploads survive container recreation (named volume `uploads_data` → `/app/uploads`)

## 7. Backups

```bash
sudo crontab -e
# daily at 03:00 server time
0 3 * * * /root/lms/scripts/backup.sh >> /var/log/lms/backup.log 2>&1
```

- DB dump + uploads archive land in `/var/backups/lms/`, pruned after 14 days
- Enable **EBS snapshots** (AWS) / **disk snapshots** (GCP) from the cloud console for off-host recovery

## 8. Rolling back

- DB: `docker compose -f docker-compose.prod.yml exec -T database pg_restore -U lims -d lims /path/to/backup.sql` (or restore from EBS snapshot)
- Code: `git checkout <previous-tag>` then `./scripts/deploy.sh`

## 9. Notes & gotchas

- The Caddyfile is HTTP-only (`:80`) on purpose — Cloudflare terminates TLS. Do not re-enable Caddy host ports.
- `NEXT_PUBLIC_API_URL` is baked into the frontend image at build time as `https://aldrasat.edu/api/v1` — rebuild (`./scripts/deploy.sh`) if it ever changes.
- Real client IPs appear as Cloudflare IPs at the app layer; if needed later, forward `CF-Connecting-IP` via Caddy (see `docs/plans/cloudflare-tunnel-setup.md`).
- Logs: `docker compose -f docker-compose.prod.yml logs -f <service>`; Sentry captures backend errors if `SENTRY_DSN` is set.
