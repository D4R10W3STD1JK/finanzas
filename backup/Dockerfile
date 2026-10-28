# Misma versión mayor que el servicio db para que pg_dump sea compatible.
FROM postgres:17-alpine
RUN apk add --no-cache tzdata
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
