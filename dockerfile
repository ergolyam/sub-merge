FROM docker.io/node:24-alpine

RUN adduser -D -h /home/appuser appuser

WORKDIR /home/appuser

COPY --chown=appuser:appuser . .

USER appuser

ENV PORT=3000

CMD ["node", "server.js"]
