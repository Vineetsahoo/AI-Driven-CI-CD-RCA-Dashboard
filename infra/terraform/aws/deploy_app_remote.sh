#!/usr/bin/env bash
set -euo pipefail

cp /tmp/server.js /opt/MoraAI/server.js
cp /tmp/app.js /opt/MoraAI/public/app.js

cd /opt/MoraAI
docker-compose up -d --build app
