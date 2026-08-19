FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd -m -u 1000 appuser
COPY --chown=appuser:appuser . .

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:8002/health || exit 1

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
