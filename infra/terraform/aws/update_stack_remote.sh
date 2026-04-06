#!/usr/bin/env bash
set -euo pipefail

cp /tmp/server.js /opt/MoraAI/server.js
cp /tmp/app.js /opt/MoraAI/public/app.js
cp /tmp/index.html /opt/MoraAI/public/index.html
cp /tmp/docker-compose.yml /opt/MoraAI/docker-compose.yml
cp /tmp/moraai-overview.json /opt/MoraAI/monitoring/grafana/dashboards/moraai-overview.json

cd /opt/MoraAI
docker-compose up -d --build app grafana
