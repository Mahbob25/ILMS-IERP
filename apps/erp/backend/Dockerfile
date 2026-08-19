FROM python:3.11-slim as builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim

WORKDIR /app

# curl is needed by the container healthcheck.
# postgresql-client-16 provides pg_dump matching the PG16 server (Database Backups feature).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    gnupg \
    ca-certificates \
    && . /etc/os-release \
    && curl -sSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /etc/apt/trusted.gpg.d/pgdg.asc \
    && echo "deb http://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Install site-packages + binaries into /usr/local so the non-root
# runtime user (appuser) can execute them (a copy of /root/.local is
# not traversable by other users).
COPY --from=builder /root/.local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /root/.local/bin /usr/local/bin

RUN useradd -m -u 1000 appuser

COPY --chown=appuser:appuser . .

# Ensure the backups volume mount point is writable by the non-root appuser.
RUN mkdir -p /app/backups && chown -R 1000:1000 /app/backups

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Run pending DB migrations before starting the server.
# The compose file provides DATABASE_URL / JWT_SECRET_KEY via the environment.
COPY --chown=appuser:appuser docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
