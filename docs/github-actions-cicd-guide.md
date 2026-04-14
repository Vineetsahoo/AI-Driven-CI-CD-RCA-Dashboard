# GitHub Actions CI/CD Guide

This repository now includes two workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/cd-eks.yml`

## 1) CI workflow (`ci.yml`)

Trigger:
- Push to any branch
- Pull request

What it does:
1. `backend-check`: installs backend dependencies and validates `server.js` syntax.
2. `frontend-build`: installs frontend dependencies and builds Vite app.
3. `api-smoke`: starts backend, waits for readiness, and verifies `/health` plus `/api/rca/providers`.
4. `sonar-scan`: optionally runs SonarCloud analysis when GitHub secrets are configured.
5. `docker-build`: builds production Docker image after earlier checks pass.

### 1.1) SonarCloud monitoring phase (optional)

The CI workflow now supports SonarCloud as a monitoring and code-quality phase. To enable it, add the following repository secrets in GitHub:
- `SONAR_TOKEN`
- `SONAR_ORGANIZATION`
- `SONAR_PROJECT_KEY`

When these secrets are present, `ci.yml` will run the `sonar-scan` job and use `sonar-project.properties` at the repository root.

### 1.2) Jenkins cloud pipeline

A root-level `Jenkinsfile` is included to support a Jenkins-based cloud pipeline.
It performs the following stages:
- checkout source code
- install backend and frontend dependencies
- backend syntax validation
- frontend build
- optional SonarCloud quality gate when Jenkins environment variables are provided
- start the backend service and run Bedrock RCA smoke tests against `/api/rca/providers` and `/api/rca/analyze`

This lets Jenkins show the cloud pipeline progress while validating the failure analysis layer and Bedrock RCA integration.

Why this matters:
- Pull requests fail early when frontend build breaks.
- Docker build validates deployment packaging before merge.
- The pipeline visually demonstrates stage-by-stage CI progression for demos.

## 2) CD workflow (`cd-eks.yml`)

Trigger:
- Manual run from Actions tab (`workflow_dispatch`)

Inputs required at run time:
- `aws_role_to_assume` (IAM role ARN for OIDC)
- `eks_cluster_name`

Optional inputs:
- `aws_region` (default `us-east-1`)
- `ecr_repository` (default `moraai`)
- `k8s_namespace` (default `moraai`)
- `k8s_deployment` (default `moraai-platform`)

What it does:
1. Authenticates to AWS using OIDC role.
2. Logs in to Amazon ECR.
3. Builds and pushes Docker image tagged with commit SHA.
4. Configures `kubectl` for your EKS cluster.
5. Applies Kubernetes manifests.
6. Updates deployment image to the new SHA tag.
7. Waits for rollout to finish.

## 3) Recommended AWS IAM permissions for the deploy role

The assumed role should allow:
- ECR: push image layers and manifests
- EKS: describe cluster and auth via `aws eks update-kubeconfig`
- Kubernetes API access through mapped IAM identity (`aws-auth` / access entry)

## 4) How this maps to your app flow

- Build flow: React app compiles to `frontend/dist` and is served by Express.
- Runtime flow: backend API routes (`/api/saas/*`) drive incidents and remediation.
- RCA flow: Bedrock -> Ollama -> local fallback chain.
- If the configured Ollama model is missing, the backend auto-pulls it and exposes a temporary `pulling` state.
- Deploy flow: GitHub Actions builds image -> pushes to ECR -> updates EKS deployment.

## 5) Notes for Ollama in deployment

- In Kubernetes, `OLLAMA_ENABLED` is `false` by default in `infra/k8s/deployment.yaml`.
- To use Ollama in-cluster, set:
  - `OLLAMA_ENABLED=true`
  - `OLLAMA_URL` to your Ollama service URL
  - `OLLAMA_MODEL` to the pulled model name
- For Bedrock integration, apply a secret based on `infra/k8s/rca-secrets.example.yaml`.
