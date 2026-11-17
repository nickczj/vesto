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

## Valuation history

The `snapshot` sidecar runs on the app image and calls authenticated
`POST /api/snapshots` once per SGT date at 08:00 (00:00 UTC). It retries for up
to `SNAPSHOT_RETRY_MINUTES` (default 120) while FX or a provider is unavailable,
and it catches up on startup if today's row is missing or incomplete. The app
owns the valuation logic; the sidecar owns no data and has no volume.

- One row per `as_of_date` in `valuation_history`. A complete day is final; an
  incomplete day may be improved by retries. `?force=always` overwrites.
- There is no backfill. A missed day stays missing.
- The chart and portfolio drawdown use complete days only; incomplete days are
  stored and counted but excluded.

```sh
cd /home/nick/services/vesto/deploy
docker compose --project-name vesto-v2 --env-file ../.env -f docker-compose.nas.yml logs --tail=30 snapshot

cd /home/nick/services/vesto
sqlite3 data/vesto-v2.db "SELECT as_of_date, net_worth_sgd, unpriced, is_complete FROM valuation_history ORDER BY as_of_date DESC LIMIT 7;"
```

Manual capture (runs one attempt with retries, useful after a restart):

```sh
cd /home/nick/services/vesto
docker compose --project-name vesto-v2 --env-file .env -f deploy/docker-compose.nas.yml \
  run --rm --no-deps snapshot node /app/scripts/valuation-snapshot.mjs --once
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
7. `docker compose ... logs --tail=20 snapshot` shows a capture or an `unchanged` day, and the history card renders without an error.
8. After a schema change: restore the pre-deploy snapshot to a scratch copy and compare row counts.

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
home. The off-site copy is the `offsite` service below. Never point any backup
job at the live `data/vesto-v2.db`: it runs in WAL mode.

## Off-site backup (Cloudflare R2)

The `offsite` compose service copies `backups/` to a private Cloudflare R2
bucket with restic. It reads only the sidecar snapshots, so it can never catch
the database mid-write, and restic encrypts client-side: R2 stores ciphertext.

- **Cadence:** immediately on start, then every 24 hours.
- **Retention:** 7 daily, 4 weekly, 12 monthly, pruned by restic. Do not add an
  R2 lifecycle rule; it can delete pack files restic still references.
- **Integrity:** `restic check` runs after every backup.
- **Monitoring:** every run posts to a Home Assistant webhook. Failure raises a
  notification immediately; no success for 54 hours raises a stale alert.

### One-time setup

1. Cloudflare dashboard → R2 → create a private bucket, e.g. `vesto-backups`.
2. R2 → Manage API tokens → create a token scoped to that bucket with
   **Object Read & Write**. Keep the Access Key ID and Secret Access Key.
3. On the NAS:

```sh
cd /home/nick/services/vesto
cp deploy/offsite.env.example .env.offsite
chmod 600 .env.offsite
# fill in RESTIC_REPOSITORY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# AWS_DEFAULT_REGION=auto and HA_VESTO_WEBHOOK

# repository password: long, random, and also in the password manager
openssl rand -base64 32 > deploy/restic-password
chmod 600 deploy/restic-password
```

The endpoint is `https://<account_id>.r2.cloudflarestorage.com` and the
repository is `s3:` followed by that URL and `/vesto-backups`.

4. Start it. `--force-recreate` matters if the container is already running
   with the empty env file, because compose reads `env_file` only at creation:

```sh
cd deploy
docker compose --project-name vesto-v2 --env-file ../.env \
  -f docker-compose.nas.yml up -d --force-recreate offsite
docker compose --project-name vesto-v2 --env-file ../.env \
  -f docker-compose.nas.yml logs -f offsite
```

Before the config is filled in the log says `not configured ... idling`. After
it, the first run initialises the repository and logs `backup finished`.

### Verify

```sh
# one run by hand, outside the loop
docker compose ... exec offsite sh /usr/local/bin/offsite.sh --once

# the repository holds snapshots
docker compose ... exec offsite restic snapshots

# restore the newest snapshot and check it
docker compose ... exec offsite restic restore latest --target /tmp/restore
sqlite3 -readonly /tmp/restore/backups/vesto-v2-*.db \
  'PRAGMA integrity_check; select count(*) from asset_entries;'
```

Compare the row count with the live database. Do this once when the service is
set up and again whenever the retention policy changes.

### When the alert fires

| Alert | Meaning | First checks |
| --- | --- | --- |
| Backup failed | The last run could not reach R2, upload, or initialise | `docker compose logs --tail=100 offsite`; R2 token revoked or bucket renamed |
| Backup is stale | No successful run for 54 hours | Is the container running? Is the NAS up? Did the webhook URL change? |

The webhook id is a secret in `.env.offsite` and in the HA automation. The
automation is `local_only`, so the NAS must be on the same LAN.

Losing `deploy/restic-password` makes the off-site copy unreadable. It is the
one secret that must also exist outside this NAS.


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
