#!/bin/bash
# Pull verified Vesto SQLite snapshots from the NAS to this Mac.
#
# The NAS keeps 14 days of snapshots next to the live database. This job makes a
# second, off-host copy with independent 30-day retention. A snapshot is only
# installed in the destination after SQLite's integrity_check passes, so a file
# caught mid-write is discarded and retried on the next run.
#
# macOS ships openrsync, which cannot talk to the NAS's rsync 3.4.1, so this
# uses tar over SSH. Install with deploy/com.nick.vesto-backup-pull.plist; see
# RUNBOOK.md.
set -euo pipefail

NAS_HOST="${NAS_HOST:-nas.local}"
NAS_PORT="${NAS_PORT:-2222}"
NAS_USER="${NAS_USER:-nick}"
REMOTE_DIR="${REMOTE_DIR:-/home/nick/services/vesto/backups}"
DEST="${VESTO_BACKUP_DIR:-$HOME/Backups/vesto}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
INCOMING="$DEST/.incoming"
LOCK="${TMPDIR:-/tmp}/vesto-backup-pull.lock"

log() { echo "$(date '+%F %T') $*"; }

mkdir -p "$DEST" "$INCOMING"
chmod 700 "$DEST"

# launchd can fire a missed job on wake; do not overlap two runs.
if ! mkdir "$LOCK" 2>/dev/null; then
  log "another run is in progress; skipping"
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT

# Only pick up files at least two minutes old, so a snapshot is never read while
# the backup sidecar is still writing it.
rm -f "$INCOMING"/vesto-v2-*.db
if ! ssh -p "$NAS_PORT" -o BatchMode=yes -o ConnectTimeout=15 \
  "$NAS_USER@$NAS_HOST" \
  "cd '$REMOTE_DIR' && find . -maxdepth 1 -type f -name 'vesto-v2-*.db' -mmin +2 -print0 | tar --null -T - -cf -" \
  | tar -xpf - -C "$INCOMING"; then
  log "error: snapshot transfer failed"
  exit 1
fi

installed=0
for file in "$INCOMING"/vesto-v2-*.db; do
  [ -e "$file" ] || continue
  if [ "$(sqlite3 -readonly "$file" 'PRAGMA integrity_check;')" = "ok" ]; then
    mv -f "$file" "$DEST/"
    installed=$((installed + 1))
  else
    log "warning: discarding incomplete snapshot $(basename "$file")"
    rm -f "$file"
  fi
done

newest="$(ls -1t "$DEST"/vesto-v2-*.db 2>/dev/null | head -n 1 || true)"
if [ -z "$newest" ]; then
  log "error: no verified snapshots in $DEST"
  exit 1
fi

assets="$(sqlite3 -readonly "$newest" 'SELECT COUNT(*) FROM asset_entries;')"
liabilities="$(sqlite3 -readonly "$newest" 'SELECT COUNT(*) FROM liability_entries;')"
if [ "${assets:-0}" -lt 1 ]; then
  log "error: $(basename "$newest") has no assets"
  exit 1
fi

find "$DEST" -maxdepth 1 -name 'vesto-v2-*.db' -type f -mtime +"$RETENTION_DAYS" -delete
chmod 600 "$DEST"/vesto-v2-*.db 2>/dev/null || true

count="$(find "$DEST" -maxdepth 1 -name 'vesto-v2-*.db' -type f | wc -l | tr -d ' ')"
log "ok: $(basename "$newest") assets=$assets liabilities=$liabilities installed=$installed local_snapshots=$count"
