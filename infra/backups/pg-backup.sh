#!/bin/sh
# Nightly pg_dump + optional upload to a DigitalOcean Space (S3-compatible).
#
# Env:
#   PGURL             — postgres connection string (required)
#   BACKUP_DIR        — local dump directory (default /backups)
#   RETAIN_DAYS       — days to keep local dumps (default 14)
#   S3_ENDPOINT       — e.g. https://nyc3.digitaloceanspaces.com (optional)
#   S3_BUCKET         — space name (optional; if unset, uploads are skipped)
#   S3_PREFIX         — object key prefix (default dontopedia/pg)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — DO Spaces keys
set -eu

: "${PGURL:?PGURL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
S3_PREFIX="${S3_PREFIX:-dontopedia/pg}"

TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/dontopedia-$TS.sql.gz"

echo "[pg-backup] dumping -> $FILE"
pg_dump --no-owner --no-privileges "$PGURL" | gzip -9 > "$FILE"
echo "[pg-backup] size: $(du -h "$FILE" | cut -f1)"

if [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
  echo "[pg-backup] uploading to s3://$S3_BUCKET/$S3_PREFIX/"
  aws --endpoint-url "$S3_ENDPOINT" s3 cp "$FILE" \
    "s3://$S3_BUCKET/$S3_PREFIX/$(basename "$FILE")"
fi

echo "[pg-backup] pruning local backups older than $RETAIN_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'dontopedia-*.sql.gz' \
  -mtime "+$RETAIN_DAYS" -print -delete || true

echo "[pg-backup] done"
