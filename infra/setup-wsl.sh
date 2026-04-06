#!/bin/bash
set -e

run_sudo() {
  sudo "$@"
}

echo "========================================="
echo " MoraAI - WSL Environment Setup"
echo "========================================="

# --- kubectl ---
echo "[1/4] Installing kubectl..."
if ! command -v kubectl &>/dev/null; then
  run_sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | run_sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /" | run_sudo tee /etc/apt/sources.list.d/kubernetes.list >/dev/null
  run_sudo apt-get update -y >/dev/null 2>&1
  run_sudo apt-get install -y kubectl >/dev/null 2>&1
  echo "  kubectl installed: $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)"
else
  echo "  kubectl already installed: $(kubectl version --client --short 2>/dev/null || echo 'OK')"
fi

# --- Jenkins (repo + key only, not starting as service) ---
echo "[2/4] Setting up Jenkins repository..."
if ! command -v jenkins &>/dev/null; then
  curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | run_sudo tee /usr/share/keyrings/jenkins-keyring.asc >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | run_sudo tee /etc/apt/sources.list.d/jenkins.list >/dev/null
  run_sudo apt-get update -y >/dev/null 2>&1
  # Jenkins needs Java
  run_sudo apt-get install -y fontconfig openjdk-17-jre-headless 2>&1 | tail -2
  run_sudo apt-get install -y jenkins 2>&1 | tail -2
  echo "  Jenkins installed"
else
  echo "  Jenkins already installed"
fi

# --- Verify Docker is working ---
echo "[3/4] Verifying Docker..."
if docker info >/dev/null 2>&1; then
  echo "  Docker OK: $(docker --version)"
  echo "  Docker Compose: $(docker compose version 2>/dev/null || echo 'N/A')"
else
  echo "  Docker daemon not running, starting..."
  run_sudo service docker start 2>/dev/null || run_sudo dockerd &
  sleep 3
  docker info >/dev/null 2>&1 && echo "  Docker started" || echo "  WARNING: Docker not accessible"
fi

# --- Fix key permissions ---
echo "[4/4] Setting up SSH key permissions..."
if [ -f ~/MoraAI/my-key.pem ]; then
  chmod 400 ~/MoraAI/my-key.pem
  echo "  SSH key permissions set (400)"
fi

# --- Install npm dependencies ---
echo ""
echo "========================================="
echo " Installing project dependencies..."
echo "========================================="
cd ~/MoraAI
npm install 2>&1 | tail -5

echo ""
echo "========================================="
echo " Verification Summary"
echo "========================================="
echo "AWS CLI:          $(aws --version 2>/dev/null | cut -d' ' -f1 || echo 'NOT FOUND')"
echo "Terraform:        $(terraform --version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "Ansible:          $(ansible --version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "Docker:           $(docker --version 2>/dev/null || echo 'NOT FOUND')"
echo "Docker Compose:   $(docker compose version 2>/dev/null || echo 'NOT FOUND')"
echo "Node.js:          $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "npm:              $(npm --version 2>/dev/null || echo 'NOT FOUND')"
echo "kubectl:          $(kubectl version --client 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "Jenkins:          $(jenkins --version 2>/dev/null || echo 'installed (service)')"
echo "Python3:          $(python3 --version 2>/dev/null || echo 'NOT FOUND')"
echo "Project dir:      ~/MoraAI"
echo ""
echo "========================================="
echo " Setup Complete!"
echo "========================================="
