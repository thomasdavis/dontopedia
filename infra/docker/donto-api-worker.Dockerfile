# syntax=docker/dockerfile:1.7
# Donto extraction worker — Python Temporal worker for extraction jobs
# Same image as donto-api, different entrypoint.
# Build context: parent of dontopedia/ and donto/ (../../.. from this file).

FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY donto/apps/donto-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY donto/apps/donto-api/ .

CMD ["python", "worker.py"]
