# Vesto NAS runbook

Operational procedures for the `vesto-v2` stack on the UGREEN NAS.
Deploy path in this estate: `/home/nick/services/vesto` (the GitHub Actions
secret `NAS_DEPLOY_PATH` points at it).

## Layout

| Path | Contents |
| --- | --- |
| `data/vesto-v2.db` (+ `-wal`, `-shm`) | Live SQLite database, mounted into the app |
| `backups/vesto-v2-<timestamp>.db` | Consistent snapshots, written by the `backup` service |
| `data/restore-archive/` | Automatic copy of the database taken before a restore |
| `.env` | Runtime secrets and ports (not in git) |

## Why not `cp`

SQLite runs in WAL mode. On 2026-11-16 the live `vesto-v2.db` was 4 KB while
`vesto-v2.db-wal` held 811 KB — copying only the `.db` file would have produced
an empty portfolio. The `backup` service uses SQLite's online backup API
(`better-sqlite3` `db.backup()`), verifies `PRAGMA integrity_check` and row
counts, then converts the snapshot to a single non-WAL file.

## Snapshots

The `backup` sidecar runs on the app image and takes one snapshot immediately on
start, then every `BACKUP_INTERVAL_SECS` (default 86400). It keeps
`BACKUP_RETENTION_DAYS` (default 14) of history.

```sh
cd /home/nick/services/vesto/deploy
docker compose --project-name vesto-v2 --env-file ../.env -f docker-compose.nas.yml logs --tail=20 backup
ls -lh ../backups
```

Manual snapshot without waiting for the timer:

```sh
cd /home/nick/services/vesto
docker compose --project-name vesto-v2 --env-file .env -f deploy/docker-compose.nas.yml \
  run --rm --no-deps backup node /app/scripts/backup-db.mjs --once
```

## Restore

Pick a snapshot and run the restore script from the deploy directory. It
verifies the snapshot, stops the app and backup containers, archives the current
database (all three files), installs the snapshot, starts the stack and waits
for `/api/healthz`.

```sh
cd /home/nick/services/vesto/deploy
./restore-db.sh /home/nick/services/vesto/backups/vesto-v2-2026-11-16T08-40-20-248Z.db
```

If the health check fails, the previous database is in
`../data/restore-archive/vesto-v2.db.<timestamp>`. Stop the stack, copy those
files back, and start it again.

Test the restore path on a copy before relying on it: run a snapshot, copy the
whole `data/` directory to `/tmp`, restore the snapshot, open the app and check
the asset count. Do this at least once per quarter and after any schema change.

## Post-deploy smoke test

Run after any deploy that touches money math, auth, data, or the container layout.

1. `curl -s -o /dev/null -w '%{http_code}\n' https://finance.nickczj.com/api/healthz` → `200`.
2. The same URL without credentials → `401`; with `-u vesto:<password>` → `200`.
3. Load the page. Net worth should match the Excel export or a manual sum.
4. No unexpected `unpriced` badges; if FX is deliberately unavailable, the banner appears.
5. Create, edit and delete a test liability; refresh; the change persists.
6. `docker compose ... logs --tail=20 backup` shows a snapshot with asset/liability counts.
7. After a schema change: restore the pre-deploy snapshot to a scratch copy and compare row counts.

## Off-host copy

The snapshots above live on the same NAS. That protects against app bugs and
bad migrations, not against NAS loss. The Mac mini pulls a second copy twice
daily with `deploy/backup-pull.sh` (launchd label
`com.nick.vesto-backup-pull`), keeping 30 days in `~/Backups/vesto`.

The pull runs on the Mac on purpose: it starts when the Mac is awake, and
launchd runs a missed calendar job on wake. Each file is checked with
`PRAGMA integrity_check` before it is installed, and only snapshots at least two
minutes old are transferred, so a file cannot be caught mid-write. The transfer
uses tar over SSH because macOS openrsync cannot talk to the NAS's rsync 3.4.1.

Install on the Mac mini:

```sh
cp deploy/com.nick.vesto-backup-pull.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nick.vesto-backup-pull.plist
launchctl kickstart -k gui/$(id -u)/com.nick.vesto-backup-pull
```

Verify:

```sh
tail ~/Library/Logs/vesto-backup-pull.log
ls -lh ~/Backups/vesto
sqlite3 -readonly ~/Backups/vesto/<newest>.db 'PRAGMA integrity_check;'
```

Restore from the Mac copy: copy the chosen file back to the NAS and run
`restore-db.sh` as above.

This is an off-host copy, not an off-site one: both machines are in the same
home. Backrest on the NAS (`http://nas.local:9898`) remains the intended
platform for the off-site copy and whole-NAS backups. Configure it with a
repository that is **not on this NAS** (S3/B2 via rclone, or a restic
REST/SFTP target), source `/userdata/services/vesto/backups`, daily schedule,
and a retention policy (for example 14 daily / 8 weekly / 4 monthly). Verify by
restoring one snapshot to `/tmp` and opening it with `sqlite3`. Never point a
Backrest plan at the live `data/vesto-v2.db`: it runs in WAL mode.

## Auth rollout

The app enforces HTTP Basic auth from `server/middleware/auth.ts`. `/api/healthz`
and static assets stay public; everything else returns 401 until credentials are
supplied. In production an empty `NUXT_AUTH_PASSWORD` returns 503 rather than
serving the balance sheet.

1. Add to `../.env`:
   ```sh
   NUXT_AUTH_USER=vesto
   NUXT_AUTH_PASSWORD=<long random value>
   ```
   Generate the password with `openssl rand -base64 32`.
2. Deploy. The deploy script refuses to run while the password is unset or
   `change_me`.
3. Verify:
   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://finance.nickczj.com/api/healthz   # 200
   curl -sS -o /dev/null -w '%{http_code}\n' https://finance.nickczj.com/api/assets     # 401
   curl -sS -u vesto:<password> -o /dev/null -w '%{http_code}\n' https://finance.nickczj.com/api/assets  # 200
   ```

## Port binding (done 2026-11-16)

Both apps publish only on loopback, and Traefik reaches them over the `traefik`
Docker network. The LAN can no longer bypass Traefik.

| App | Published | Traefik URL |
| --- | --- | --- |
| `vesto-v2` | `127.0.0.1:42001` | `http://vesto-v2:3000` |
| `vesto-api` | `127.0.0.1:42000` | `http://vesto-api:8080` |
| Postgres | `127.0.0.1:55432` | n/a |

`APP_BIND_IP=127.0.0.1` is set in both `.env` files. The Traefik entries are in
`/home/nick/services/traefik/config/dynamic.yaml`; the file provider watches for
changes. The pre-change config is backed up next to it as
`dynamic.yaml.bak-<timestamp>`.

Verify:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://finance.nickczj.com/api/healthz  # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://vesto-go.nickczj.com/healthz     # 200
curl -sS --connect-timeout 3 http://192.168.0.228:42001/api/healthz                # must fail
curl -sS --connect-timeout 3 http://192.168.0.228:42000/healthz                    # must fail
```

Rollback: set `APP_BIND_IP=0.0.0.0` in the affected `.env`, then recreate that
service (`docker compose ... up -d --no-deps <service>`). Restore the old
Traefik URL only if Traefik cannot reach the container by name. A manual
recreate needs the current image reference:

```sh
IMG=$(docker inspect <container> --format '{{.Config.Image}}')
IMAGE_REPO=${IMG%:*} IMAGE_TAG=${IMG##*:} docker compose ... up -d --no-deps <service>
```
