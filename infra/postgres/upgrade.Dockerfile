# One-off image for infra/postgres/pg-upgrade.sh: the pinned db image (compose.yaml) plus the server packages of
# the major it upgrades from, which pg_upgrade runs beside the new ones. Built by infra/scripts/pg-upgrade.sh.
ARG BASE
FROM ${BASE}
ARG FROM_MAJOR=18
RUN apt-get update \
    && apt-get install -y --no-install-recommends "postgresql-${FROM_MAJOR}" "postgresql-${FROM_MAJOR}-pgvector" \
    && rm -rf /var/lib/apt/lists/*
COPY pg-upgrade.sh /usr/local/bin/pg-upgrade.sh
ENV PG_UPGRADE_FROM=${FROM_MAJOR}
