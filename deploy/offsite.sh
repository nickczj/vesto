#!/bin/sh
# Encrypted off-site copy of the database snapshots, in Cloudflare R2.
#
# The `backup` sidecar writes verified snapshots under /backups; this service
# only copies them. It never reads the live database or its WAL files.
#
# Home Assistant is the monitor: every run posts to a webhook, and a stale
# last-success timestamp raises the alarm. See deploy/RUNBOOK.md.
#
# Usage:
#   sh offsite.sh          # loop
#   sh offsite.sh --once   # one cycle, for a manual run or a test
#
# Env:
#   RESTIC_REPOSITORY       required, s3:https://<account>.r2.cloudflarestorage.com/<bucket>
#   RESTIC_PASSWORD_FILE    default /run/secrets/restic-password
#   HA_VESTO_WEBHOOK        optional, HA webhook URL for the run result
#   BACKUP_DIR              default /backups
#   OFFSITE_INTERVAL_HOURS  default 24
#   OFFSITE_HOST            default vesto-nas

set -eu

backup_dir="${BACKUP_DIR:-/backups}"
interval_hours="${OFFSITE_INTERVAL_HOURS:-24}"
password_file="${RESTIC_PASSWORD_FILE:-/run/secrets/restic-password}"
host_tag="${OFFSITE_HOST:-vesto-nas}"
webhook="${HA_VESTO_WEBHOOK:-}"

log() { printf '[offsite] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' '
}

notify() {
  [ -n "$webhook" ] || return 0
  wget -q -O /dev/null -T 15 \
    --header 'Content-Type: application/json' \
    --post-data "$1" "$webhook" || log 'webhook post failed'
}

report() {
  status="$1"
  duration="$2"
  detail="$3"
  at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ "$status" = success ]; then
    notify "{\"status\":\"success\",\"host\":\"$host_tag\",\"at\":\"$at\",\"duration_s\":$duration}"
  else
    notify "{\"status\":\"failure\",\"host\":\"$host_tag\",\"at\":\"$at\",\"duration_s\":$duration,\"message\":\"$(json_escape "$detail")\"}"
  fi
}

configured() {
  [ -n "${RESTIC_REPOSITORY:-}" ] && [ -s "$password_file" ]
}

if ! configured; then
  # Idle rather than exit: the container is created before the operator fills
  # in .env.offsite, and an exiting container under `restart: unless-stopped`
  # would only restart in a loop.
  log "not configured (RESTIC_REPOSITORY or $password_file is empty); idling"
  while :; do sleep 3600; done
fi

wait_for_snapshot() {
  while ! ls "$backup_dir"/vesto-v2-*.db >/dev/null 2>&1; do
    log "no snapshot in $backup_dir yet; waiting"
    sleep 300
  done
}

ensure_repository() {
  restic snapshots >/dev/null 2>&1 && return 0
  log 'initialising restic repository'
  restic init
}

run_once() {
  started=$(date +%s)

  # A container stopped mid-backup leaves a stale lock behind. There is exactly
  # one writer, so clearing it is safe and avoids a 30-minute lock timeout.
  restic unlock >/dev/null 2>&1 || true

  if output=$(restic backup "$backup_dir" \
      --host "$host_tag" --tag vesto-v2 \
      --exclude '*-wal' --exclude '*-shm' 2>&1); then
    restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune \
      >/dev/null 2>&1 || log 'forget/prune failed'
    restic check >/dev/null 2>&1 || log 'restic check failed'

    duration=$(( $(date +%s) - started ))
    log "backup finished in ${duration}s"
    fail_streak=0
    report success "$duration" ''
    return 0
  fi

  duration=$(( $(date +%s) - started ))
  detail=$(printf '%s' "$output" | tail -n 3)
  log "backup failed after ${duration}s: $detail"
  # One alert per outage. The daily staleness check covers an outage that
  # outlives this one message.
  if [ "$fail_streak" -eq 0 ]; then
    report failure "$duration" "$detail"
  fi
  fail_streak=$(( fail_streak + 1 ))
  return 1
}

wait_for_snapshot

fail_streak=0

if [ "${1:-}" = "--once" ]; then
  ensure_repository
  run_once
  exit $?
fi

while :; do
  if ! ensure_repository; then
    if [ "$fail_streak" -eq 0 ]; then
      report failure 0 'repository unreachable or credentials rejected'
    fi
    fail_streak=$(( fail_streak + 1 ))
    sleep 900
    continue
  fi

  if ! run_once; then
    sleep 900
  fi

  sleep $(( interval_hours * 3600 ))
done
