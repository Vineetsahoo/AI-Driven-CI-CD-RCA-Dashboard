#!/usr/bin/env bash
set -euo pipefail

APP_URL="http://44.198.166.96:3000"
GRAFANA_URL="http://44.198.166.96:3001"
PROM_URL="http://44.198.166.96:9090"
RCA_API_URL="https://n52ix6pw08.execute-api.us-east-1.amazonaws.com/prod/analyze"

check() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="${4:-}"

  local code
  if [[ "$method" == "POST" ]]; then
    code=$(curl -sS -o /tmp/moraai_${name}.out -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$body" "$url" || true)
  else
    code=$(curl -sS -o /tmp/moraai_${name}.out -w "%{http_code}" "$url" || true)
  fi

  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    echo "[OK]   ${name}: HTTP ${code}"
  else
    echo "[FAIL] ${name}: HTTP ${code}"
    head -c 240 /tmp/moraai_${name}.out 2>/dev/null || true
    echo
  fi
}

echo "MoraAI health check - $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
check app_health "${APP_URL}/health"
check app_root "${APP_URL}/"
check grafana "${GRAFANA_URL}/login"
check prometheus "${PROM_URL}/-/healthy"
check rca_api "${RCA_API_URL}" "POST" '{"pipelineId":"P-1001","logText":"Build failed due missing module in deployment pipeline"}'

echo "Done."
