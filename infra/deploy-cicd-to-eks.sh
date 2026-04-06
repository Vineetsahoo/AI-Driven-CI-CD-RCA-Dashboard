#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WSL_MIRROR_DIR="${WSL_MIRROR_DIR:-$HOME/MoraAI}"
AWS_REGION="${AWS_REGION:-us-east-1}"
EKS_CLUSTER_NAME="${EKS_CLUSTER_NAME:-moraai-eks}"
K8S_NAMESPACE="${K8S_NAMESPACE:-moraai}"
K8S_DEPLOYMENT="${K8S_DEPLOYMENT:-moraai-platform}"
K8S_SERVICE="${K8S_SERVICE:-moraai-platform}"
RUN_EC2_STACK_SYNC="${RUN_EC2_STACK_SYNC:-false}"

log() {
  printf '\n[%s] %s\n' "$(date -u +"%Y-%m-%d %H:%M:%S UTC")" "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd rsync
require_cmd aws
require_cmd kubectl
require_cmd ansible-playbook
require_cmd curl

run_ansible_with_retry() {
  local playbook="$1"
  local attempts=2
  local n=1

  while (( n <= attempts )); do
    if ANSIBLE_HOST_KEY_CHECKING=False ANSIBLE_BECOME_TIMEOUT=60 ansible-playbook -i infra/ansible/inventory.ini "$playbook"; then
      return 0
    fi

    if (( n == attempts )); then
      echo "Ansible playbook failed after ${attempts} attempts: ${playbook}" >&2
      return 1
    fi

    log "Ansible playbook failed (attempt ${n}/${attempts}), retrying in 10s: ${playbook}"
    sleep 10
    ((n++))
  done
}

log "Syncing workspace to ${WSL_MIRROR_DIR}"
mkdir -p "${WSL_MIRROR_DIR}"
rsync -a --delete \
  --exclude node_modules \
  --exclude frontend/node_modules \
  --exclude .git \
  "${PROJECT_ROOT}/" "${WSL_MIRROR_DIR}/"

cd "${WSL_MIRROR_DIR}"

if [[ "${RUN_EC2_STACK_SYNC}" == "true" ]]; then
  log "Deploying app/monitoring stack to EC2 via Ansible"
  run_ansible_with_retry infra/ansible/site.yml
else
  log "Skipping full EC2 stack reprovision (set RUN_EC2_STACK_SYNC=true to enable)"
fi

log "Building and pushing container image to ECR"
ECR_PASSWORD="$(aws ecr get-login-password --region "${AWS_REGION}")"
export ECR_PASSWORD
run_ansible_with_retry infra/ansible/push-ecr-image.yml

log "Updating kubeconfig for ${EKS_CLUSTER_NAME}"
aws eks update-kubeconfig --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}" >/dev/null

log "Applying Kubernetes manifests"
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/deployment.yaml
kubectl apply -f infra/k8s/service.yaml
kubectl apply -f infra/k8s/hpa.yaml

log "Forcing deployment rollout so latest image is pulled"
kubectl -n "${K8S_NAMESPACE}" rollout restart deployment/"${K8S_DEPLOYMENT}"
kubectl -n "${K8S_NAMESPACE}" rollout status deployment/"${K8S_DEPLOYMENT}" --timeout=600s

log "Collecting Kubernetes status"
kubectl -n "${K8S_NAMESPACE}" get pods -o wide
kubectl -n "${K8S_NAMESPACE}" get svc "${K8S_SERVICE}" -o wide

LB_HOST="$(kubectl -n "${K8S_NAMESPACE}" get svc "${K8S_SERVICE}" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
if [[ -z "${LB_HOST}" ]]; then
  echo "LoadBalancer hostname is not ready yet. Re-run health check in a minute." >&2
  exit 1
fi

log "Running health check through Kubernetes LoadBalancer"
HTTP_CODE="$(curl -sS -o /tmp/moraai-k8s-health.out -w '%{http_code}' "http://${LB_HOST}/health" || true)"
if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "Kubernetes LB health check failed with HTTP ${HTTP_CODE}" >&2
  cat /tmp/moraai-k8s-health.out || true
  exit 1
fi

echo "K8S_LB_URL=http://${LB_HOST}"
echo "K8S_LB_HEALTH_STATUS=${HTTP_CODE}"
log "CI/CD one-command deployment completed successfully"
