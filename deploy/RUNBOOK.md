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
bad migrations, not against NAS loss. Backrest is already running at
`http://nas.local:9898` and mounts `/home/nick` read-only as `/userdata`, but it
has no plan configured.

Recommended: create a Backrest plan with the source path
`/userdata/services/vesto/backups`, a repository that is **not on this NAS**
(S3/B2 via rclone, or a restic REST/SFTP target), daily schedule, and a
retention policy (for example 14 daily / 8 weekly / 4 monthly). Verify by
restoring one snapshot to `/tmp` and opening it with `sqlite3`.

If no off-host target is available yet, copy the latest snapshot to the Mac
mini manually after a deploy; do not treat NAS-local snapshots as a backup.

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

## Port binding (two-step, no downtime)

The containers currently publish on `0.0.0.0`, so the LAN can bypass Traefik.
The app port is only needed by Traefik and the local health check.

1. **Attach to Traefik first.** The compose file already puts `vesto-v2` on the
   external `traefik` network. Update the Traefik service URL in
   `/home/nick/services/traefik/config/dynamic.yaml` from
   `http://192.168.0.228:42001` to `http://vesto-v2:3000` and reload/restart
   Traefik. Confirm `https://finance.nickczj.com` still works.
2. **Bind to loopback.** Set `APP_BIND_IP=127.0.0.1` in `../.env` and redeploy.
   The health check (`127.0.0.1:42001`) still works; the LAN can no longer reach
   the app directly.
3. For `vesto-go`, do the same with `http://vesto-api:8080`, then set
   `APP_BIND_IP=127.0.0.1` and change Postgres to `127.0.0.1:55432:5432`.
   Alternatively, drop the `vesto-go.nickczj.com` route entirely; the Nuxt
   container reaches the API over `vesto-shared`.

Rollback: set `APP_BIND_IP=0.0.0.0`, restore the Traefik URL, redeploy. Both
steps are independent, so a failed step 1 does not require step 2.
