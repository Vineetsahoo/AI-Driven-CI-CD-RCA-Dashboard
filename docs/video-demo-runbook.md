# MoraAI Deployment Video Runbook

Goal: Record a clean end-to-end demo showing manual CI/CD deployment and verification.

Duration target: 10 to 15 minutes.

## 1) Pre-recording checklist

- Open 2 terminals:
  - Terminal A: Windows PowerShell in C:\Users\vinee\Downloads\project
  - Terminal B: WSL Ubuntu
- Open browser tabs in advance:
  - App: http://44.198.166.96:3000
  - Grafana: http://44.198.166.96:3001
  - Prometheus: http://44.198.166.96:9090
  - EKS LB app: http://aa43d3d499efc4676822e449372bb3c0-813026566.us-east-1.elb.amazonaws.com
- Keep this file open for narration.

## 2) Intro narration (20-30 sec)

Say:
- This demo shows MoraAI CI/CD deployment with AWS, Terraform-provisioned infra, Ansible, Docker, ECR, EKS, Prometheus, Grafana, and Bedrock Lambda RCA.
- I will run commands manually and verify each layer.

## 3) Show environment and identity

In Terminal A (PowerShell):

1. pwd
2. wsl -d Ubuntu -- bash -lc 'pwd'
3. wsl -d Ubuntu -- bash -lc 'aws sts get-caller-identity'
4. wsl -d Ubuntu -- bash -lc 'aws eks update-kubeconfig --region us-east-1 --name moraai-eks >/dev/null; kubectl get nodes -o wide'

Expected:
- AWS account shown.
- EKS nodes in Ready state.

## 4) Run one-command CI/CD manually

In Terminal A (PowerShell):

1. wsl -d Ubuntu -- bash -lc 'cd ~/MoraAI; bash infra/deploy-cicd-to-eks.sh'

Narrate while running:
- Sync workspace
- Build and push image to ECR
- Apply Kubernetes manifests
- Restart rollout and wait for success
- Verify LoadBalancer health

Expected end lines:
- K8S_LB_URL=http://aa43d3d499efc4676822e449372bb3c0-813026566.us-east-1.elb.amazonaws.com
- K8S_LB_HEALTH_STATUS=200
- CI/CD one-command deployment completed successfully

## 5) Verify Kubernetes objects

In Terminal A:

1. wsl -d Ubuntu -- bash -lc 'aws eks update-kubeconfig --region us-east-1 --name moraai-eks >/dev/null; kubectl get ns moraai'
2. wsl -d Ubuntu -- bash -lc 'kubectl -n moraai get deploy,pods,svc,hpa -o wide'
3. wsl -d Ubuntu -- bash -lc 'kubectl -n moraai rollout status deploy/moraai-platform --timeout=300s'

Expected:
- Deployment available
- Pods running
- Service type LoadBalancer

## 6) Verify public endpoints

In Terminal A:

1. Invoke-WebRequest -Uri http://44.198.166.96:3000/health -UseBasicParsing
2. Invoke-WebRequest -Uri http://44.198.166.96:3001/login -UseBasicParsing
3. Invoke-WebRequest -Uri http://44.198.166.96:9090/-/healthy -UseBasicParsing
4. $lb='aa43d3d499efc4676822e449372bb3c0-813026566.us-east-1.elb.amazonaws.com'; Invoke-WebRequest -Uri ("http://"+$lb+"/health") -UseBasicParsing

Expected:
- HTTP 200 on all checks.

## 7) Grafana login demo

In browser on Grafana tab:
- Username: admin
- Password: admin123

Narrate:
- Datasource is auto-provisioned
- Dashboard is provisioned under MoraAI

## 8) RCA API verification

In Terminal A:

1. $body = '{"pipelineId":"P-1001","logText":"Build failed due missing module in deployment pipeline"}'
2. Invoke-WebRequest -Uri https://n52ix6pw08.execute-api.us-east-1.amazonaws.com/prod/analyze -Method POST -ContentType "application/json" -Body $body -UseBasicParsing

Expected:
- HTTP 200 and JSON RCA response.

## 9) Bedrock console check

In the AWS Console, the old Model access page now shows a retirement notice. That is expected in this region.

Show this instead:

1. AWS Console -> Bedrock -> Model catalog.
2. Search for the model used by the project: `amazon.nova-lite-v1:0`.
3. Open the model details or the invoke/test area if available.
4. Explain that the project uses Bedrock through the Lambda/API path, so the real proof is the API test and CloudWatch logs, not the retired access page.

What to say:
- Bedrock model access is now managed automatically in commercial regions.
- The retired page is normal and does not mean the project is broken.
- The real validation is the Lambda invoke result, API Gateway route, and CloudWatch logs.

## 10) WSL one-command health check

In Terminal A:

1. wsl -d Ubuntu -- bash -lc '~/moraai-health-check.sh'

Expected:
- OK for app_health, app_root, grafana, prometheus, rca_api

## 11) Tools-wise summary narration

Say:
- Terraform provisioned AWS infrastructure.
- Ansible handled host deployment and ECR image pipeline tasks.
- Docker built app image and pushed to ECR.
- Kubernetes (EKS) rolled out app with service and autoscaling.
- Prometheus and Grafana validated monitoring endpoints.
- Lambda Bedrock RCA API validated AI failure analysis path.

## 12) Performance check (optional)

In Terminal A:

1. $dash = Measure-Command { $null = Invoke-WebRequest -Uri http://44.198.166.96:3000/api/saas/dashboard -UseBasicParsing -TimeoutSec 30 }; Write-Output ('dashboard_ms=' + [math]::Round($dash.TotalMilliseconds,2))
2. $prov = Measure-Command { $null = Invoke-WebRequest -Uri http://44.198.166.96:3000/api/rca/providers -UseBasicParsing -TimeoutSec 30 }; Write-Output ('providers_ms=' + [math]::Round($prov.TotalMilliseconds,2))

## 12) Closing narration (15 sec)

Say:
- Manual CI/CD run completed.
- Image push and EKS rollout succeeded.
- App, monitoring, and RCA API are healthy.
- MoraAI platform is production-demo ready.
