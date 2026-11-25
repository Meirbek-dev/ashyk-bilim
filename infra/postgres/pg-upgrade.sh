#!/bin/sh
# Major upgrade of one stopped cluster with pg_upgrade, as root in the image of infra/postgres/upgrade.Dockerfile
# with the data volume at /var/lib/postgresql (infra/scripts/pg-upgrade.sh runs it): the cluster of
# PG_UPGRADE_FROM (default 18) in <from>/docker becomes one of the image's major in <PG_MAJOR>/docker. Copy mode:
# the old directory stays untouched, renamed to <from>/docker.before-pg<PG_MAJOR> (the image refuses to start
# beside a <major>/docker it cannot read), so going back is renaming it again with the old image.
set -eu
from=${PG_UPGRADE_FROM:-18}
to=$PG_MAJOR
user=${POSTGRES_USER:-postgres}
old=/var/lib/postgresql/$from/docker
new=/var/lib/postgresql/$to/docker
if [ ! -s "$old/PG_VERSION" ]; then
  echo "pg-upgrade: no Postgres $from cluster in this volume; nothing to do"
  exit 0
fi
[ ! -e "$new" ] || { echo "pg-upgrade: $new exists (an earlier attempt?): move it aside first" >&2; exit 1; }

# initdb as the entrypoint ran it (locale from the image's LANG), with the old cluster's checksum setting.
checksums=--no-data-checksums
"/usr/lib/postgresql/$from/bin/pg_controldata" "$old" | grep -Eq '^Data page checksum version: +[1-9]' &&
  checksums=--data-checksums
install -d -o postgres -g postgres "/var/lib/postgresql/$to"
install -d -o postgres -g postgres -m 700 "$new"
gosu postgres "/usr/lib/postgresql/$to/bin/initdb" -D "$new" -U "$user" "$checksums" >/dev/null

# pg_upgrade writes its logs and scripts into the working directory.
work=$(mktemp -d /var/lib/postgresql/pg-upgrade.XXXXXX)
chown postgres:postgres "$work"
cd "$work"
run() {
  gosu postgres "/usr/lib/postgresql/$to/bin/pg_upgrade" -U "$user" \
    -b "/usr/lib/postgresql/$from/bin" -B "/usr/lib/postgresql/$to/bin" -d "$old" -D "$new" "$@"
}
if ! run --check || ! run --copy; then
  echo "pg-upgrade: failed; logs in $new/pg_upgrade_output.d; $old is untouched (remove $new to retry)" >&2
  exit 1
fi
# Access rules and ALTER SYSTEM values belong to the cluster, not to the binaries.
for f in pg_hba.conf pg_ident.conf postgresql.auto.conf; do
  [ ! -f "$old/$f" ] || cp -p "$old/$f" "$new/$f"
done
# ALTER EXTENSION ... UPDATE for the extensions the new major ships newer: infra/scripts/pg-upgrade.sh runs it.
[ ! -f update_extensions.sql ] || cp -p update_extensions.sql "/var/lib/postgresql/$to/update_extensions.sql"
cd /
rm -rf "$work"
mv "$old" "$old.before-pg$to"
echo "pg-upgrade: Postgres $from -> $to done; the old cluster is $old.before-pg$to ($(du -sh "$old.before-pg$to" | cut -f1))"
