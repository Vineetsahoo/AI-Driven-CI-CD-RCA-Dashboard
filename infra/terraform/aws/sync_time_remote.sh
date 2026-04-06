#!/usr/bin/env bash
set -euo pipefail

echo "Before sync:"
date -u

if command -v timedatectl >/dev/null 2>&1; then
  sudo timedatectl set-ntp true || true
fi

if command -v chronyd >/dev/null 2>&1 || systemctl list-unit-files | grep -q '^chronyd\.service'; then
  sudo systemctl enable --now chronyd || true
fi

if command -v chronyc >/dev/null 2>&1; then
  sudo chronyc -a makestep || true
  chronyc tracking || true
fi

echo "After sync:"
date -u
