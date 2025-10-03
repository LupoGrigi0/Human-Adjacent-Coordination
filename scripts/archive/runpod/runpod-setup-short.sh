#!/bin/bash
# Short version - downloads full script from current repo
echo "🚀 Downloading RunPod setup automation script..."
curl -sL https://raw.githubusercontent.com/lupo/Human-Adjacent-Coordination/main/scripts/runpod-setup-automation.sh -o setup.sh
chmod +x setup.sh
echo "✅ Running automation script..."
./setup.sh