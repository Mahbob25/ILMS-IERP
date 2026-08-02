# Cloudflare Tunnel Setup Plan

## Target Architecture

```
Internet → Cloudflare Edge (SSL) → Cloudflared Container → Caddy (port 80, HTTP) → backend:8000 & frontend:3000
```

Cloudflare handles public SSL and DDoS protection. Caddy receives decrypted traffic from the tunnel and routes it internally.

## Changes Required

### 1. `docker-compose.prod.yml` — Add cloudflared service

Insert after the `caddy` service block:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: lims_cloudflared
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: ${TUNNEL_TOKEN?err}
  restart: unless-stopped
  networks:
    - lims-internal
  depends_on:
    - caddy
```

Shares the `lims-internal` network, reaches Caddy at `caddy:80`. No host ports exposed.

### 2. `docker-compose.prod.yml` — Remove Caddy host ports

Delete these lines from the `caddy` service:

```yaml
# ports:
#   - "80:80"
#   - "443:443"
```

### 3. `infrastructure/caddy/Caddyfile` — Switch to HTTP-only

Replace the domain-based config with a port-80 listener:

```caddyfile
:80 {
    encode gzip

    reverse_proxy /api/v1/* {env.BACKEND_URL}
    reverse_proxy /uploads/* {env.BACKEND_URL}
    reverse_proxy * {env.FRONTEND_URL}

    header {
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.example.com; form-action 'self'"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        X-XSS-Protection "0"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
```

Changes: `:80` replaces `aldrasat.edu { tls internal }`. Routing and headers preserved.

### 4. `.env` — Add tunnel token

```ini
TUNNEL_TOKEN=your_cloudflare_tunnel_token_here
```

### 5. Cloudflare Dashboard Setup (manual)

1. Go to Cloudflare Zero Trust → Networks → Tunnels
2. Create a new tunnel
3. Copy the tunnel token to `.env`
4. Configure Public Hostname: `aldrasat.edu` → Service: `HTTP` → URL: `caddy:80`

### 6. Cloudflare IP Forwarding (optional follow-up)

For real client IPs in FastAPI logs, Caddy can inject `CF-Connecting-IP` header. Not required for tunnel to work.

## What Stays Unchanged

| File | Status |
|------|--------|
| `docker-compose.yml` (dev) | No changes |
| `backend/Dockerfile` | No changes |
| `frontend/Dockerfile` | No changes |
| `infrastructure/postgres/init.sql` | No changes |
| `infrastructure/logrotate/lms.conf` | No changes |
| All `.gitignore`, `.dockerignore` | No changes |
| Backend/frontend application code | No changes |
