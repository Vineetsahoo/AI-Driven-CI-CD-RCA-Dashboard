# CPPE Deployment Commands Guide

This guide gives you the exact command order to run the project based on your implementation.

## 1) Prerequisites

Install and configure these tools before running anything:
- Node.js 20+
- Docker and Docker Compose
- AWS CLI
- Terraform 1.5+
- kubectl (only if using EKS)
- Ansible (only if using EC2 + Ansible path)

Configure AWS credentials:

```bash
aws configure
aws sts get-caller-identity
```

## 2) Local Run (Node only)

From project root:

```bash
npm install
npm start
```

Open:
- http://localhost:3000

## 3) Local Full Stack (App + Prometheus + Grafana)

From project root:

```bash
npm run docker:up
```

Stop stack:

```bash
npm run docker:down
```

Open:
- App: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

Grafana login:
- username: admin
- password: admin123

## 4) Terraform Deployment on AWS

Go to Terraform folder:

```bash
cd infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars
```

If you are in PowerShell instead of Linux shell:

```powershell
cd infra/terraform/aws
Copy-Item terraform.tfvars.example terraform.tfvars
```

Edit terraform.tfvars and set:
- key_name
- allowed_ssh_cidr
- optional flags: enable_ecr, enable_eks, enable_bedrock

Run Terraform:

```bash
terraform init
terraform plan
terraform apply
```

Get outputs:

```bash
terraform output
```

## 5) SSH Into EC2 Host (from Terraform output)

If your key file is in WSL path:

```bash
chmod 400 /mnt/c/Users/vinee/Downloads/project/my-key.pem
ssh -i /mnt/c/Users/vinee/Downloads/project/my-key.pem ec2-user@<EC2_PUBLIC_IP>
```

Replace <EC2_PUBLIC_IP> with output instance_public_ip.

## 6) Ansible Deployment Path (EC2 host)

From project root:

```bash
cd infra/ansible
cp inventory.ini.example inventory.ini
```

Update inventory.ini:
- ansible_host with EC2 public IP
- ansible_ssh_private_key_file with your .pem path

Update group vars:
- infra/ansible/group_vars/all.yml
- set git_repo_url and git_branch

Run playbook:

```bash
ansible-playbook -i inventory.ini site.yml
```

## 7) EKS Path (only if enable_eks=true)

### 7.1 Build and push image to ECR

Get account and region values:

```bash
aws sts get-caller-identity --query Account --output text
aws configure get region
```

Authenticate Docker to ECR:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

Build, tag, push:

```bash
docker build -t moraai .
docker tag moraai:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/moraai:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/moraai:latest
```

### 7.2 Update Kubernetes deployment image

In infra/k8s/deployment.yaml, replace REPLACE_WITH_ECR_IMAGE_URI with:

```text
<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/moraai:latest
```

### 7.3 Connect kubectl to EKS and apply manifests

```bash
aws eks update-kubeconfig --region us-east-1 --name <eks_cluster_name>
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/deployment.yaml
kubectl apply -f infra/k8s/service.yaml
kubectl apply -f infra/k8s/hpa.yaml
```

Check resources:

```bash
kubectl get pods -n moraai
kubectl get svc -n moraai
```

## 8) Do you need AWS account ID?

- Not required as an input variable for Terraform in this project.
- Required for ECR image URI when tagging/pushing Docker images and updating Kubernetes deployment image.

## 9) Recommended Execution Order

1. Run local app with npm.
2. Run local full stack with Docker.
3. Deploy Terraform infrastructure.
4. Choose one deployment path:
   - Ansible on EC2, or
   - EKS with Kubernetes.
5. Validate app and monitoring endpoints.
