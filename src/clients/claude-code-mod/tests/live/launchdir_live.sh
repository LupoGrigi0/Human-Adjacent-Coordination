#!/bin/bash
# Cairn's (c): a fixture launched from a directory that is NOT its home must write preferences.json THERE.
# The wrong ($HOME) implementation fails this test; nothing else can tell them apart on our boxes.
U=dev-reconstruction-001-7630; H=/home/$U; L=/tmp/hacs-launchdir-test
rm -rf $L; mkdir -p $L; chown $U $L
IID=$(python3 -c "import json;print(json.load(open('$H/.hacs-identity'))['instanceId'])")
printf '{"theme_marker": "launchdir-only", "hacs": {"instanceId": "%s"}}\n' "$IID" > $L/preferences.json; chown $U $L/preferences.json
HOME_BEFORE=$(sha256sum $H/preferences.json 2>/dev/null | cut -c1-16)
cd $L && runuser -u $U -- env -i HOME=$H USER=$U PATH=/opt/claude-2.1.287/bin:/usr/bin:/bin LANG=C.UTF-8 XDG_RUNTIME_DIR=/run/user/$(id -u $U) \
  claude -p "/hacs" --plugin-dir /tmp/hacs-mod-ptest </dev/null > /tmp/launchdir_out.txt 2>&1
echo "rc=$?"
echo "== /hacs output (config line):"; grep -i "config\|identity\|unread" /tmp/launchdir_out.txt | head -5
sleep 3
echo "== launch-dir preferences.json now:"; python3 -c "import json;d=json.load(open('$L/preferences.json'));print('theme_marker kept:', d.get('theme_marker')=='launchdir-only'); print('hacs keys:', sorted(d['hacs']))"
HOME_AFTER=$(sha256sum $H/preferences.json 2>/dev/null | cut -c1-16)
echo "== home preferences.json unchanged: $([ "$HOME_BEFORE" = "$HOME_AFTER" ] && echo YES || echo NO) ($HOME_BEFORE -> $HOME_AFTER)"
