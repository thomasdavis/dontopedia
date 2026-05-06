# syntax=docker/dockerfile:1.7
# Donto Knowledge Graph API — FastAPI + Temporal worker
# Build context: parent of dontopedia/ and donto/ (../../.. from this file).

FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY donto/apps/donto-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY donto/apps/donto-api/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
