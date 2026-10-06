#!/bin/bash
#
# install-systemd-unit.sh — Install or update the claude-code-channel@.service
# template unit, optionally enable + start it for a specific instance.
#
# This is a one-time operation per server. After installing, systemd can
# manage claude-code-channel instances by name:
#   systemctl start  claude-code-channel@Crossing-2d23
#   systemctl enable claude-code-channel@Crossing-2d23
#   systemctl status claude-code-channel@Crossing-2d23
#
# Arguments:
#   --install-only         Just install the template + daemon-reload (default)
#   --enable <InstanceId>  Also enable for this instance (auto-start on boot)
#   --start <InstanceId>   Also start the service now
#
# Example:
#   # First-time install + enable Crossing-2d23
#   sudo ./install-systemd-unit.sh --enable Crossing-2d23 --start Crossing-2d23
#
# Author: Crossing-2d23

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_TEMPLATE="$SCRIPT_DIR/claude-code-channel@.service"
SYSTEMD_TARGET="/etc/systemd/system/claude-code-channel@.service"

ENABLE_INSTANCE=""
START_INSTANCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --install-only) shift ;;
    --enable) ENABLE_INSTANCE="$2"; shift 2 ;;
    --start) START_INSTANCE="$2"; shift 2 ;;
    --help|-h)
      sed -n '3,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: must run as root (uses systemctl)" >&2
  exit 1
fi

if [ ! -f "$SERVICE_TEMPLATE" ]; then
  echo "ERROR: template not found at $SERVICE_TEMPLATE" >&2
  exit 1
fi

echo "[install] Copying $SERVICE_TEMPLATE -> $SYSTEMD_TARGET"
cp "$SERVICE_TEMPLATE" "$SYSTEMD_TARGET"
chmod 644 "$SYSTEMD_TARGET"

echo "[install] Running systemctl daemon-reload"
systemctl daemon-reload

# Sanity check: parse the unit
if ! systemctl cat claude-code-channel@.service >/dev/null 2>&1; then
  echo "ERROR: systemd doesn't recognize the unit after install" >&2
  exit 1
fi

echo "[install] Template installed and recognized."

if [ -n "$ENABLE_INSTANCE" ]; then
  echo "[enable] systemctl enable claude-code-channel@$ENABLE_INSTANCE"
  systemctl enable "claude-code-channel@$ENABLE_INSTANCE"
fi

if [ -n "$START_INSTANCE" ]; then
  echo "[start] systemctl start claude-code-channel@$START_INSTANCE"
  systemctl start "claude-code-channel@$START_INSTANCE"
  sleep 2
  echo "[status]"
  systemctl status "claude-code-channel@$START_INSTANCE" --no-pager -l | head -20
fi

echo ""
echo "Useful follow-up commands:"
echo "  systemctl status claude-code-channel@<InstanceId>"
echo "  systemctl restart claude-code-channel@<InstanceId>"
echo "  journalctl -u claude-code-channel@<InstanceId> -f"
echo "  systemctl disable claude-code-channel@<InstanceId>  # stop auto-start"
