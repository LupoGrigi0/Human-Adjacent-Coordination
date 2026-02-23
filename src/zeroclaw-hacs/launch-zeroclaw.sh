#!/usr/bin/env bash
# launch-zeroclaw.sh — Launch a ZeroClaw instance from a HACS home directory
# Usage: ./launch-zeroclaw.sh <instanceId> [options]
#
# Options:
#   --port <port>       Gateway port (default: auto-allocate from 19000-19100)
#   --model <model>     Default model (default: grok-4)
#   --provider <id>     Default provider (default: xai)
#   --env-file <path>   Path to .env with API keys (default: /mnt/openclaw/.env)
#   --dry-run           Show what would be done without doing it

set -euo pipefail

# --- Constants ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_DIR="/mnt/coordinaton_mcp_data/instances"
PORT_RANGE_START=19000
PORT_RANGE_END=19100
DEFAULT_MODEL="grok-4"
DEFAULT_PROVIDER="xai"
DEFAULT_ENV_FILE="/mnt/.secrets/zeroclaw.env"

# --- Parse arguments ---
INSTANCE_ID=""
PORT=""
MODEL="${DEFAULT_MODEL}"
PROVIDER="${DEFAULT_PROVIDER}"
ENV_FILE="${DEFAULT_ENV_FILE}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --provider) PROVIDER="$2"; shift 2 ;;
        --env-file) ENV_FILE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) INSTANCE_ID="$1"; shift ;;
    esac
done

if [[ -z "${INSTANCE_ID}" ]]; then
    echo "Usage: $0 <instanceId> [--port N] [--model M] [--provider P] [--env-file F] [--dry-run]"
    exit 1
fi

INSTANCE_HOME="${INSTANCES_DIR}/${INSTANCE_ID}"
ZEROCLAW_DIR="${INSTANCE_HOME}/zeroclaw"
CONTAINER_NAME="zeroclaw-${INSTANCE_ID}"

# --- Validate instance exists ---
if [[ ! -d "${INSTANCE_HOME}" ]]; then
    echo "ERROR: Instance directory not found: ${INSTANCE_HOME}"
    exit 1
fi

# --- Auto-allocate port if not specified ---
find_free_port() {
    for port in $(seq ${PORT_RANGE_START} ${PORT_RANGE_END}); do
        if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q "${port}->"; then
            echo "${port}"
            return 0
        fi
    done
    echo "ERROR: No free ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}" >&2
    return 1
}

if [[ -z "${PORT}" ]]; then
    PORT=$(find_free_port)
    echo "Auto-allocated port: ${PORT}"
fi

# Web UI port = gateway port + 1
WEB_PORT=$((PORT + 1))

# --- Display plan ---
echo ""
echo "=== ZeroClaw Launch Plan ==="
echo "  Instance:   ${INSTANCE_ID}"
echo "  Home:       ${INSTANCE_HOME}"
echo "  ZeroClaw:   ${ZEROCLAW_DIR}"
echo "  Container:  ${CONTAINER_NAME}"
echo "  Gateway:    ${PORT} -> 3000"
echo "  Web UI:     ${WEB_PORT} -> 8080"
echo "  Provider:   ${PROVIDER}"
echo "  Model:      ${MODEL}"
echo "  Env file:   ${ENV_FILE}"
echo ""

if ${DRY_RUN}; then
    echo "[DRY RUN] Would create directory structure and start container."
    exit 0
fi

# --- Create directory structure ---
echo "Creating directory structure..."
mkdir -p "${ZEROCLAW_DIR}/config"
mkdir -p "${ZEROCLAW_DIR}/workspace"
mkdir -p "${ZEROCLAW_DIR}/logs"

# --- Generate config.toml from template ---
echo "Generating config.toml..."
sed \
    -e "s|__INSTANCE_ID__|${INSTANCE_ID}|g" \
    -e "s|default_provider = \"xai\"|default_provider = \"${PROVIDER}\"|g" \
    -e "s|default_model = \"grok-4\"|default_model = \"${MODEL}\"|g" \
    "${SCRIPT_DIR}/config.template.toml" \
    > "${ZEROCLAW_DIR}/config/config.toml"

# --- Generate docker-compose.yml from template ---
echo "Generating docker-compose.yml..."
sed \
    -e "s|__INSTANCE_ID__|${INSTANCE_ID}|g" \
    -e "s|__INSTANCE_HOME__|${INSTANCE_HOME}|g" \
    -e "s|__PORT__|${PORT}|g" \
    -e "s|__WEB_PORT__|${WEB_PORT}|g" \
    "${SCRIPT_DIR}/docker-compose.template.yml" \
    > "${ZEROCLAW_DIR}/docker-compose.yml"

# --- Copy .env file ---
if [[ -f "${ENV_FILE}" ]]; then
    echo "Copying API keys from ${ENV_FILE}..."
    cp "${ENV_FILE}" "${ZEROCLAW_DIR}/.env"
else
    echo "WARNING: No .env file found at ${ENV_FILE}"
    echo "Create ${ZEROCLAW_DIR}/.env with your API keys"
fi

# --- Copy HACS skill to workspace (if exists) ---
HACS_SKILL_SOURCE="${SCRIPT_DIR}/../openclaw/skills/hacs/SKILL.md"
if [[ -f "${HACS_SKILL_SOURCE}" ]]; then
    echo "Installing HACS skill..."
    mkdir -p "${ZEROCLAW_DIR}/workspace/skills/hacs"
    cp "${HACS_SKILL_SOURCE}" "${ZEROCLAW_DIR}/workspace/skills/hacs/SKILL.md"
fi

# --- Copy hacs_client.js ---
HACS_CLIENT_SOURCE="${SCRIPT_DIR}/../openclaw/hacs_client.js"
if [[ -f "${HACS_CLIENT_SOURCE}" ]]; then
    echo "Installing hacs_client.js..."
    cp "${HACS_CLIENT_SOURCE}" "${ZEROCLAW_DIR}/workspace/hacs_client.js"
fi

# --- THE IRON RULE: Fix permissions ---
# ZeroClaw container runs as nobody:nogroup (65534:65534)
echo "Fixing permissions (UID 65534)..."
chown -R 65534:65534 "${ZEROCLAW_DIR}"
chmod 600 "${ZEROCLAW_DIR}/config/config.toml"
chmod 600 "${ZEROCLAW_DIR}/.env" 2>/dev/null || true

# --- Launch container ---
echo "Launching container..."
cd "${ZEROCLAW_DIR}"
docker-compose up -d 2>&1

# --- Wait for health ---
echo "Waiting for health check..."
for i in $(seq 1 30); do
    if docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q "healthy"; then
        echo "Container is healthy!"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "WARNING: Container not healthy after 30s. Check: docker logs ${CONTAINER_NAME}"
    fi
    sleep 1
done

# --- Auto-pair and capture token ---
echo "Pairing with gateway..."
PAIRING_CODE=$(docker logs "${CONTAINER_NAME}" 2>&1 | grep -oP '│\s+\K\d{6}' | tail -1)
if [[ -n "${PAIRING_CODE}" ]]; then
    PAIR_RESPONSE=$(curl -s -X POST "http://127.0.0.1:${PORT}/pair" \
        -H "X-Pairing-Code: ${PAIRING_CODE}" \
        -H "Content-Type: application/json" \
        -d '{"name": "hacs-operator"}')
    BEARER_TOKEN=$(echo "${PAIR_RESPONSE}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
    if [[ -n "${BEARER_TOKEN}" ]]; then
        echo "  Paired successfully!"
        echo "${BEARER_TOKEN}" > "${ZEROCLAW_DIR}/bearer-token.txt"
        chmod 600 "${ZEROCLAW_DIR}/bearer-token.txt"
        echo "  Token saved to ${ZEROCLAW_DIR}/bearer-token.txt"
    else
        echo "WARNING: Pairing failed. Response: ${PAIR_RESPONSE}"
    fi
else
    echo "WARNING: Could not extract pairing code from logs"
fi

# --- Inject bearer token into web UI auth ---
if [[ -n "${BEARER_TOKEN:-}" ]]; then
    echo "Configuring web UI auth..."
    sed -i "s|__BEARER_TOKEN__|${BEARER_TOKEN}|g" "${ZEROCLAW_DIR}/config/config.toml"
    chown 65534:65534 "${ZEROCLAW_DIR}/config/config.toml"
fi

# --- Setup nginx proxy (requires claw-nginx-setup from Bastion) ---
if command -v claw-nginx-setup &>/dev/null; then
    echo "Setting up nginx proxy..."
    claw-nginx-setup add "${INSTANCE_ID}" "${PORT}" --type zeroclaw
    # Web UI nginx config (separate port, with sub_filter for WS path fix)
    WEB_CONF="/etc/nginx/claw-instances/zeroclaw-${INSTANCE_ID}-web.conf"
    cat > "${WEB_CONF}" << NGINXEOF
# Auto-generated by launch-zeroclaw.sh — ZeroClaw Web UI
# Instance: ${INSTANCE_ID} | Port: ${WEB_PORT}
location /zeroclaw/${INSTANCE_ID}/web/ {
    proxy_pass http://127.0.0.1:${WEB_PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Accept-Encoding "";
    proxy_cookie_path / /zeroclaw/${INSTANCE_ID}/web/;
    sub_filter_once off;
    sub_filter_types text/html;
    sub_filter 'zc_sessions' 'zc_sessions_${INSTANCE_ID}';
    sub_filter 'location.host}/ws' 'location.host}/zeroclaw/${INSTANCE_ID}/web/ws';
    proxy_connect_timeout 120s;
    proxy_read_timeout 24h;
    proxy_send_timeout 24h;
    proxy_buffering off;
    proxy_cache off;
}
NGINXEOF
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null
    echo "  nginx proxy configured for gateway and web UI"
else
    echo "NOTE: claw-nginx-setup not found. Set up nginx proxy manually."
fi

# --- Update instance preferences ---
echo "Updating instance preferences..."
PREFS_FILE="${INSTANCE_HOME}/preferences.json"
if [[ -f "${PREFS_FILE}" ]]; then
    node -e "
const fs = require('fs');
const prefs = JSON.parse(fs.readFileSync('${PREFS_FILE}', 'utf8'));
prefs.interface = 'zeroclaw';
prefs.zeroclaw = {
    enabled: true,
    ready: true,
    port: ${PORT},
    webPort: ${WEB_PORT},
    containerName: '${CONTAINER_NAME}',
    provider: '${PROVIDER}',
    model: '${MODEL}',
    bearerToken: '${BEARER_TOKEN:-}',
    gatewayUrl: 'https://smoothcurves.nexus/zeroclaw/${INSTANCE_ID}/',
    webUrl: 'https://smoothcurves.nexus/zeroclaw/${INSTANCE_ID}/web/',
    launchedAt: new Date().toISOString(),
    launchedBy: 'launch-zeroclaw.sh'
};
fs.writeFileSync('${PREFS_FILE}', JSON.stringify(prefs, null, 2));
console.log('  Preferences updated with zeroclaw config');
"
fi

echo ""
echo "=== ZeroClaw Launch Complete ==="
echo "  Container: ${CONTAINER_NAME}"
echo "  Gateway:   https://smoothcurves.nexus/zeroclaw/${INSTANCE_ID}/"
echo "  Web Chat:  https://smoothcurves.nexus/zeroclaw/${INSTANCE_ID}/web/"
if [[ -n "${BEARER_TOKEN:-}" ]]; then
echo "  Token:     ${BEARER_TOKEN}"
echo "  Web URL:   https://smoothcurves.nexus/zeroclaw/${INSTANCE_ID}/web/?token=${BEARER_TOKEN}"
fi
echo ""
echo "  Health:    curl http://127.0.0.1:${PORT}/health"
echo "  Chat:      curl -X POST http://127.0.0.1:${PORT}/webhook -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{\"message\":\"hello\"}'"
echo "  Logs:      docker logs ${CONTAINER_NAME}"
echo "  Migrate:   docker exec ${CONTAINER_NAME} zeroclaw migrate openclaw --source /mnt/hacs-data/instances/${INSTANCE_ID}/openclaw/workspace"
echo ""
