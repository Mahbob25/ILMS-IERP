# Active Task: Cloud Deployment

## Status

- **v1.7 ERP & Financial System**: shipped — 221/221 backend tests passing (67% coverage), staff payroll module included
- **Cloud deployment**: in progress — infra changes committed (Cloudflare tunnel, uploads volume, deploy/backup scripts); VM provisioning + tunnel token pending
- **Next after deploy**: AI Ingestion Pipeline

## Cloud Deployment Checklist

- [ ] Provision VM (2 vCPU / 4 GB, Ubuntu 24.04) — see `docs/operations/cloud-deploy.md`
- [ ] Install Docker Engine + compose plugin
- [ ] `git clone` repo, create `.env` from `.env.example` with real secrets
- [ ] Create Cloudflare tunnel, set `TUNNEL_TOKEN`, Public Hostname `aldirasat.edu` → `caddy:80`
- [ ] `./scripts/deploy.sh` (build → `alembic upgrade head` → up)
- [ ] Verify `https://aldirasat.edu/ar/login` + `/api/v1/health`
- [ ] Backup cron: `scripts/backup.sh` daily + EBS snapshots
- [ ] Firewall: SSH only; ports 80/443 closed (tunnel-only ingress)

## Next Milestone: AI Ingestion Pipeline

After the deployment is live, resume the AI curriculum pipeline:
- Document upload & parsing (PDF/DOCX)
- Gemini embeddings & text generation
- pgvector semantic search (RAG)
- Concept map extraction & DAG
- Question generation & teacher approval
