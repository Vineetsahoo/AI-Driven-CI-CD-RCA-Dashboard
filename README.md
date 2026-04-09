# MoraAI - AI-Driven CI/CD SaaS Platform

The project now runs as a React + TypeScript + Tailwind SaaS-style frontend backed by an Express API for RCA workflows.

## Features
- SaaS template UI (React + Tailwind + shadcn-compatible structure)
- Multi-page product content routes (Home, Platform, Bedrock, Ollama, Observability, Docs)
- Live RCA provider status (Bedrock Nova -> Ollama -> Local fallback chain)
- Incident trigger and remediation workflow (trigger -> approve -> execute)
- Backend metrics endpoint for Prometheus (`/metrics`)
- Unified dashboard API for frontend (`/api/saas/dashboard`)
- GitHub Actions CI and manual CD-to-EKS workflows under `.github/workflows`

## Local Run
```bash
npm install
npm --prefix frontend install
npm --prefix frontend run build
npm start
```

Open `http://localhost:3000`.

### Development (Backend + Frontend)
Run these in separate terminals:

```bash
# backend (Express API on 3000)
npm run dev
```

```bash
# frontend (Vite on 5173 with proxy to backend)
npm run frontend:dev
```

For EC2 access in dev mode, expose Vite to the network:

```bash
npm --prefix frontend run dev -- --host 0.0.0.0
```

## Project Structure
- `server.js`: Express backend and RCA + SaaS APIs
- `frontend/src/App.tsx`: Routed frontend with dashboard + content pages
- `frontend/src/components/ui/animated-web3-landing-page.tsx`: Main hero and trigger controls
- `frontend/src/lib/api.ts`: Backend API client for SaaS endpoints
- `docs/github-actions-cicd-guide.md`: CI/CD and GitHub Actions flow explanation

## DevOps Stack (Docker + Prometheus + Grafana)
The repository now includes a monitoring architecture setup:
- App container on port `3000`
- Prometheus on port `9090`
- Grafana on port `3001`

Run everything:
```bash
npm run docker:up
```

Enable Ollama local model profile:
```bash
docker compose --profile local-llm up -d --build
```

Stop stack:
```bash
npm run docker:down
```

URLs:
- App: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (user: `admin`, pass: `admin123`)

Metrics endpoint exposed by backend:
- `GET /metrics`

## GitHub Actions Flow

- `ci.yml`: install dependencies, validate backend syntax, build frontend, build Docker image.
- `cd-eks.yml`: manual deploy workflow that builds/pushes image to ECR and rolls out to EKS.

Detailed guide:
- `docs/github-actions-cicd-guide.md`

## AWS Infrastructure with Terraform
Terraform files are under `infra/terraform/aws`.

Default region is set to **North Virginia (`us-east-1`)**.

1. Copy variables:
```bash
cd infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars
```
2. Update `terraform.tfvars` with your values (`key_name`, `allowed_ssh_cidr`).
3. Enable architecture components as needed:
	- `enable_ecr = true` for image registry
	- `enable_eks = true` for Kubernetes control plane + node group
	- `enable_bedrock = true` for Bedrock invocation IAM role/policy
	- `enable_lambda = true` for Bedrock Nova RCA Lambda + API Gateway
	- `enable_cloudwatch_log_group = true` for central logs
3. Deploy:
```bash
terraform init
terraform plan
terraform apply
```
4. Use outputs (`app_url`, `prometheus_url`, `grafana_url`, `ecr_repository_url`, `eks_cluster_name`, `bedrock_runtime_role_arn`, `rca_api_url`).

## Kubernetes (EKS) Application Manifests
Kubernetes manifests are under `infra/k8s`.

1. Build and push your app image to ECR.
2. Replace `REPLACE_WITH_ECR_IMAGE_URI` in `infra/k8s/deployment.yaml`.
3. Configure kubectl for EKS:
```bash
aws eks update-kubeconfig --region us-east-1 --name <eks_cluster_name>
```
4. Apply manifests:
```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/deployment.yaml
kubectl apply -f infra/k8s/service.yaml
kubectl apply -f infra/k8s/hpa.yaml
```

## One-Command CI/CD to EKS
Run this from WSL (Ubuntu) to execute the full flow in one command:

- Sync latest workspace into `~/MoraAI`
- Deploy/update EC2 stack via Ansible
- Build and push Docker image to ECR via Ansible
- Apply Kubernetes manifests to `moraai-eks`
- Restart rollout and verify `/health` through the EKS LoadBalancer

```bash
cd ~/MoraAI
bash infra/deploy-cicd-to-eks.sh
```

By default, this skips full EC2 reprovisioning and performs the fast path (build/push ECR + EKS rollout).
If you also want full EC2 stack reprovision in the same command, run:

```bash
RUN_EC2_STACK_SYNC=true bash infra/deploy-cicd-to-eks.sh
```

Optional npm shortcuts:

```bash
# From WSL/Linux
npm run cicd:deploy:eks

# From Windows PowerShell
npm run cicd:deploy:eks:wsl
```

## EC2 Provisioning and Deployment with Ansible
Ansible playbook is under `infra/ansible`.

1. Copy inventory:
```bash
cd infra/ansible
cp inventory.ini.example inventory.ini
```
2. Update:
- `inventory.ini` with EC2 public IP and SSH key path
- `group_vars/all.yml` with your Git repository URL/branch
3. Run deployment:
```bash
ansible-playbook -i inventory.ini site.yml
```

This installs Docker on EC2, clones the repository to `/opt/MoraAI`, and runs `docker-compose up -d --build`.

## Demo Steps
1. Open dashboard and trigger run for any pipeline.
2. If failure occurs, inspect incident details.
3. Approve remediation in detail pane.
4. Execute remediation and observe state recovery.

## Architecture Tooling Coverage
- Terraform: AWS VPC + subnet + security group + EC2 host
- Terraform (optional managed services): ECR, EKS, CloudWatch log group, Bedrock runtime IAM role, Lambda + API Gateway for Bedrock Nova RCA
- Ansible: Server provisioning and stack deployment
- Docker: App and monitoring orchestration
- Prometheus: Metrics scraping from `/metrics`
- Grafana: Auto-provisioned datasource and MoraAI dashboard
- AWS Services: EC2, VPC networking, Security Groups, Internet Gateway, ECR, EKS, CloudWatch, Bedrock-ready IAM
