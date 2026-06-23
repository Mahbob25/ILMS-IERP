# Development Notes

## Switching between Docker and local dev

### Caddyfile

When running backend/frontend locally (outside Docker), `infrastructure/caddy/Caddyfile` must proxy to `host.docker.internal`:

```
reverse_proxy /api/v1/* host.docker.internal:8000
reverse_proxy * host.docker.internal:3000
```

**Before rebuilding and running everything in Docker**, revert these lines back to Docker service names:

```
reverse_proxy /api/v1/* backend:8000
reverse_proxy * frontend:3000
```
