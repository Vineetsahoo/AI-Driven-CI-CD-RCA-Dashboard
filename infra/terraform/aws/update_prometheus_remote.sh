#!/usr/bin/env bash
set -euo pipefail

cp /tmp/docker-compose.yml /opt/MoraAI/docker-compose.yml
cp /tmp/prometheus.yml /opt/MoraAI/monitoring/prometheus/prometheus.yml
cp /tmp/alerts.yml /opt/MoraAI/monitoring/prometheus/alerts.yml
cd /opt/MoraAI

docker-compose pull prometheus
docker-compose up -d prometheus
