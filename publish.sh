#!/usr/bin/env bash
# Push the license-free Humsana MCP with fresh clean history.
set -euo pipefail
REMOTE="git@github.com:sriramnatrajhen/humsana-mcp.git"   # or https://...
rm -rf .git node_modules *.log 2>/dev/null || true
if grep -rniE "humsana.com/license|LICENSE_API_URL|hum_pro_|mcpregistry_registry_token" --include='*.ts' --include='*.js' --include='*.json' . ; then
  echo "!! license/token reference found above — aborting."; exit 1
fi
echo "clean."
git init -q -b main
git add -A
git commit -q -m "Remove license gating: fully open source, 100% local, config-controlled execution"
git remote add origin "$REMOTE"
git push -f origin main
echo "Done."
