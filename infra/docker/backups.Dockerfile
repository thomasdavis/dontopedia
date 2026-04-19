# syntax=docker/dockerfile:1.7
FROM alpine:3.20

RUN apk add --no-cache \
    bash \
    ca-certificates \
    coreutils \
    findutils \
    gzip \
    postgresql16-client \
    aws-cli \
    dcron \
    tzdata

COPY infra/backups/pg-backup.sh /usr/local/bin/pg-backup.sh
COPY infra/backups/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/pg-backup.sh \
 && mkdir -p /backups /var/log \
 && touch /var/log/pg-backup.log

# Run cron in the foreground and also tail the log so `docker logs` shows progress.
CMD ["sh", "-c", "crond -f -L /var/log/cron.log & tail -F /var/log/pg-backup.log /var/log/cron.log"]
