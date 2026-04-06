# Infrastructure Rollout Plan (Phase 2)

## Goal
Extend the working frontend/backend baseline into an architecture-ready DevOps platform using Terraform, Ansible, Docker, Prometheus, Grafana, and AWS services.

## Step 1: Container Baseline
- Build Node app container with production image (`Dockerfile`).
- Orchestrate platform components using `docker-compose.yml`.
- Ensure app + monitoring tools run together for demos.

## Step 2: Observability Foundation
- Expose backend metrics through `/metrics`.
- Scrape app metrics from Prometheus (`monitoring/prometheus/prometheus.yml`).
- Auto-provision Grafana datasource and dashboard for pipeline operations.

## Step 3: AWS Provisioning (North Virginia - us-east-1)
- Use Terraform to create:
  - VPC and public subnet
  - Internet gateway and route table
  - Security group for SSH/app/prometheus/grafana ports
  - EC2 host for deployment runtime
  - ECR repository for container images
  - EKS cluster + managed node group (toggle via `enable_eks`)
  - CloudWatch log group for workload log retention
  - Bedrock runtime IAM role/policy (toggle via `enable_bedrock`)

## Step 4: Configuration Management
- Use Ansible playbook to configure EC2 host:
  - Install Docker and dependencies
  - Pull repository and deploy stack with Docker Compose
  - Standardize repeatable rollout flow

## Step 5: Validation and Demo
- Validate services:
  - App at `:3000`
  - Prometheus at `:9090`
  - Grafana at `:3001`
- Trigger pipeline failures and confirm incident metrics are visible in Grafana.

## Step 6: Kubernetes Deployment Path
- Push app image to ECR.
- Update `infra/k8s/deployment.yaml` with ECR image URI.
- Apply Kubernetes manifests (`namespace`, `deployment`, `service`, `hpa`) on EKS.
- Add CI workflow to run Terraform plan + image push + kubectl deployment gates.
