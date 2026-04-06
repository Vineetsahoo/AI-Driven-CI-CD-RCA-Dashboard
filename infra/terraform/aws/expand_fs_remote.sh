#!/usr/bin/env bash
set -euo pipefail

if command -v growpart >/dev/null 2>&1; then
  sudo growpart /dev/nvme0n1 1 || true
fi

sudo xfs_growfs -d /
df -h /
