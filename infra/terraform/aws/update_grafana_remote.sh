#!/usr/bin/env bash
set -euo pipefail

cp /tmp/docker-compose.yml /opt/MoraAI/docker-compose.yml
cd /opt/MoraAI

docker-compose pull grafana
docker-compose up -d grafana
