#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.nas.yml}"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vesto-v2}"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-vesto-v2}"
APP_HEALTH_HOST="${APP_HEALTH_HOST:-127.0.0.1}"
APP_HEALTH_PATH="${APP_HEALTH_PATH:-/api/healthz}"
APP_HEALTH_TIMEOUT_SECONDS="${APP_HEALTH_TIMEOUT_SECONDS:-120}"

required_env_vars=(
  GHCR_USERNAME
  GHCR_TOKEN
  IMAGE_REPO
  IMAGE_TAG
)

for key in "${required_env_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var: ${key}" >&2
    exit 1
  fi
done

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1 == k {print substr($0, index($0, "=") + 1)}' "${ENV_FILE}" | tail -n1
}

APP_PORT="${APP_PORT:-$(read_env_value APP_PORT)}"
APP_PORT="${APP_PORT:-43000}"

if ! [[ "${APP_PORT}" =~ ^[0-9]+$ ]]; then
  echo "APP_PORT must be a numeric port. Received: ${APP_PORT}" >&2
  exit 1
fi

HEALTH_URL="http://${APP_HEALTH_HOST}:${APP_PORT}${APP_HEALTH_PATH}"

COMPOSE_CMD=(
  docker compose
  --project-name "${COMPOSE_PROJECT_NAME}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

previous_tag=""
previous_container_id="$("${COMPOSE_CMD[@]}" ps -q "${APP_SERVICE_NAME}" || true)"
if [[ -n "${previous_container_id}" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "${previous_container_id}" 2>/dev/null || true)"
  if [[ "${previous_image}" == "${IMAGE_REPO}:"* ]]; then
    previous_tag="${previous_image#${IMAGE_REPO}:}"
  fi
fi

rollback() {
  if [[ -z "${previous_tag}" ]]; then
    echo "Rollback skipped: previous image tag not detected." >&2
    return 1
  fi

  echo "Rolling back ${APP_SERVICE_NAME} to tag ${previous_tag}"
  IMAGE_TAG="${previous_tag}" "${COMPOSE_CMD[@]}" up -d "${APP_SERVICE_NAME}"
  if ! wait_for_health; then
    echo "Rollback failed health check at ${HEALTH_URL}" >&2
    return 1
  fi
  echo "Rollback completed successfully."
  return 0
}

print_diagnostics() {
  echo "Deployment diagnostics (service state + recent logs):" >&2
  "${COMPOSE_CMD[@]}" ps >&2 || true
  "${COMPOSE_CMD[@]}" logs --no-color --tail=200 "${APP_SERVICE_NAME}" >&2 || true
}

wait_for_health() {
  local deadline
  deadline=$((SECONDS + APP_HEALTH_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 2 "${HEALTH_URL}" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

echo "Logging in to GHCR..."
printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

mkdir -p "${PROJECT_ROOT}/data"

echo "Deploying image ${IMAGE_REPO}:${IMAGE_TAG}"

echo "Pulling images..."
IMAGE_TAG="${IMAGE_TAG}" "${COMPOSE_CMD[@]}" pull "${APP_SERVICE_NAME}"

echo "Starting ${APP_SERVICE_NAME}..."
IMAGE_TAG="${IMAGE_TAG}" "${COMPOSE_CMD[@]}" up -d "${APP_SERVICE_NAME}"

echo "Waiting for health endpoint: ${HEALTH_URL}"
if ! wait_for_health; then
  echo "Health check failed for image ${IMAGE_REPO}:${IMAGE_TAG}" >&2
  print_diagnostics
  rollback || true
  exit 1
fi

echo "Deployment successful for image ${IMAGE_REPO}:${IMAGE_TAG}"
