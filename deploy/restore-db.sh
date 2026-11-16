#!/usr/bin/env bash
# Restore the Vesto SQLite database from a consistent snapshot.
#
# Run this on the NAS from anywhere; paths are resolved from the script.
#   ./restore-db.sh /home/nick/services/vesto/backups/vesto-v2-<stamp>.db
#
# The script stops the app and backup containers, archives the current
# database (including -wal/-shm), installs the snapshot, and waits for health.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.nas.yml}"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vesto-v2}"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-vesto-v2}"
BACKUP_SERVICE_NAME="${BACKUP_SERVICE_NAME:-backup}"
DATA_DIR="${DATA_DIR:-${PROJECT_ROOT}/data}"
HEALTH_PATH="${HEALTH_PATH:-/api/healthz}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"

BACKUP_FILE="${1:-}"
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "usage: $0 <path-to-vesto-v2-backup.db>" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "backup not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required on this host" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1 == k {print substr($0, index($0, "=") + 1)}' "${ENV_FILE}" | tail -n1
}

APP_PORT="${APP_PORT:-$(read_env_value APP_PORT)}"
APP_PORT="${APP_PORT:-43000}"
HEALTH_URL="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"

echo "Verifying ${BACKUP_FILE}..."
integrity="$(sqlite3 "${BACKUP_FILE}" 'PRAGMA integrity_check;')"
if [[ "${integrity}" != "ok" ]]; then
  echo "integrity_check failed: ${integrity}" >&2
  exit 1
fi

assets="$(sqlite3 "${BACKUP_FILE}" 'SELECT COUNT(*) FROM asset_entries;')"
liabilities="$(sqlite3 "${BACKUP_FILE}" 'SELECT COUNT(*) FROM liability_entries;')"
echo "Snapshot is valid: assets=${assets} liabilities=${liabilities}"

read -r -p "Replace ${DATA_DIR}/vesto-v2.db with this snapshot? [y/N] " reply
if [[ ! "${reply}" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

COMPOSE_CMD=(
  docker compose
  --project-name "${COMPOSE_PROJECT_NAME}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

# Remember which image the stack was running so `up` does not pull a new tag.
image_repo="${IMAGE_REPO:-}"
image_tag="${IMAGE_TAG:-}"
if [[ -z "${image_repo}" || -z "${image_tag}" ]]; then
  container_id="$("${COMPOSE_CMD[@]}" ps -aq "${APP_SERVICE_NAME}" | head -n1 || true)"
  if [[ -n "${container_id}" ]]; then
    image="$(docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null || true)"
    if [[ -n "${image}" ]]; then
      image_repo="${image%:*}"
      image_tag="${image##*:}"
    fi
  fi
fi
image_tag="${image_tag:-main}"
if [[ -z "${image_repo}" ]]; then
  echo "Could not determine IMAGE_REPO. Set it in the environment or ${ENV_FILE}." >&2
  exit 1
fi
export IMAGE_REPO="${image_repo}"
export IMAGE_TAG="${image_tag}"

echo "Stopping writers..."
"${COMPOSE_CMD[@]}" stop "${APP_SERVICE_NAME}" "${BACKUP_SERVICE_NAME}" || true

mkdir -p "${DATA_DIR}/restore-archive"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

for suffix in '' '-wal' '-shm'; do
  current="${DATA_DIR}/vesto-v2.db${suffix}"
  [[ -f "${current}" ]] || continue
  cp -a "${current}" "${DATA_DIR}/restore-archive/vesto-v2.db${suffix}.${stamp}"
done

echo "Archived current database to ${DATA_DIR}/restore-archive (${stamp})"
rm -f "${DATA_DIR}/vesto-v2.db" "${DATA_DIR}/vesto-v2.db-wal" "${DATA_DIR}/vesto-v2.db-shm"
cp "${BACKUP_FILE}" "${DATA_DIR}/vesto-v2.db"
chmod 0644 "${DATA_DIR}/vesto-v2.db"

echo "Starting ${APP_SERVICE_NAME} with image tag ${image_tag}..."
"${COMPOSE_CMD[@]}" up -d "${APP_SERVICE_NAME}" "${BACKUP_SERVICE_NAME}"

deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  if curl -fsS --max-time 2 "${HEALTH_URL}" >/dev/null; then
    echo "Restore complete: ${HEALTH_URL} is healthy (assets=${assets} liabilities=${liabilities})."
    exit 0
  fi
  sleep 2
done

echo "Restored database failed its health check at ${HEALTH_URL}" >&2
echo "The previous database is in ${DATA_DIR}/restore-archive/vesto-v2.db.${stamp}" >&2
exit 1
