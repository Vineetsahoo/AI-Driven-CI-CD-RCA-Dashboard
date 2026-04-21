# MoraAI - Full Project Setup & Deployment Tasks

**Project**: AI-Driven CI/CD Failure Analysis and Auto-Remediation Platform  
**Status**: In Progress  
**Execution Date**: April 21, 2026  

---

## Phase 1: AWS Account Migration & Code Updates

### Task 1.1: Update AWS Account ID References
**Priority**: CRITICAL  
**Files Affected**: 6 files  
**Change**: legacy account ID replaced with `818825274841`

- [x] `infra/k8s/deployment.yaml` - Line 24 (ECR image URL)
- [x] `infra/ansible/push-ecr-image.yml` - Line 8 (ECR registry)
- [x] `docs/terraform-outputs-captured.md` - Line 2, 4 (documentation)
- [x] `infra/check-moraai-health.sh` - Update EC2 IP to placeholder
- [x] `infra/ansible/inventory.ini` - Update EC2 IP to placeholder

### Task 1.2: Fix GitHub Actions Syntax Error
**Priority**: CRITICAL  
**File**: `.github/workflows/ci.yml`  
**Issue**: Lines 305-312 missing `body` parameter in `createComment()` call

- [x] Fix `github-script` action in `pipeline-incident-tracking` job
- [x] Ensure proper closing of `createComment` function
- [x] Validate YAML syntax

### Task 1.3: Update SonarQube Configuration
**Priority**: HIGH  
**Files Affected**: 2 files

- [x] `sonar-project.properties` - Change from SonarCloud to local SonarQube (http://localhost:9000)
- [x] `Jenkinsfile` - Update SonarQube stage to use local instance
- [x] Create `docker-compose.sonarqube.yml` for local SonarQube + PostgreSQL

---

## Phase 2: WSL Environment Setup

### Task 2.1: WSL Prerequisites Installation
**Priority**: HIGH  
**Target**: Ubuntu in WSL

- [ ] Copy project to `~/MoraAI` in WSL
- [ ] Update package manager: `sudo apt update && sudo apt upgrade -y`
- [ ] Install Node.js 20+: `sudo apt install nodejs npm -y`
- [ ] Install Docker: `sudo apt install docker.io -y`
- [ ] Install Java 17: `sudo apt install default-jre default-jdk -y`
- [ ] Install Git: `sudo apt install git -y`
- [ ] Configure Docker daemon to run without sudo (optional but recommended)

### Task 2.2: Project Dependencies Installation
**Priority**: HIGH

- [ ] Backend dependencies: `npm ci` in project root
- [ ] Frontend dependencies: `npm --prefix frontend ci`
- [ ] Verify installation: `npm list` and `npm --prefix frontend list`

### Task 2.3: Build Frontend
**Priority**: HIGH

- [ ] Build React frontend: `npm --prefix frontend run build`
- [ ] Verify dist folder created: `ls -la frontend/dist/`

---

## Phase 3: Local Application Verification

### Task 3.1: Start Backend & Verify Health
**Priority**: HIGH

- [ ] Start backend: `npm start` (runs on http://localhost:3000)
- [ ] Health check: `curl http://localhost:3000/health`
- [ ] API endpoints check:
  - [ ] `curl http://localhost:3000/`
  - [ ] `curl http://localhost:3000/api/saas/dashboard`
  - [ ] `curl http://localhost:3000/api/pipelines`
  - [ ] `curl http://localhost:3000/api/rca/providers`
  - [ ] `curl http://localhost:3000/api/rca/architecture`

### Task 3.2: Frontend Verification
**Priority**: HIGH

- [ ] Open browser to `http://localhost:3000`
- [ ] Verify dashboard loads
- [ ] Check for console errors
- [ ] Verify API connectivity from frontend

---

## Phase 4: Jenkins on AWS Setup

### Task 4.1: AWS Infrastructure Preparation
**Priority**: HIGH

- [ ] Verify AWS credentials in WSL: `aws sts get-caller-identity`
- [ ] Confirm account: `818825274841`
- [ ] Create or verify EC2 instance for Jenkins (Ubuntu 22.04)
- [ ] Security group allows ports: 22 (SSH), 8080 (Jenkins), 3000 (MoraAI), 9000 (SonarQube)
- [ ] Create/verify ECR repository: `moraai`

### Task 4.2: Jenkins Installation on AWS EC2
**Priority**: HIGH

- [ ] SSH to EC2 instance
- [ ] Install Java 17: `sudo apt install default-jre default-jdk -y`
- [ ] Install Jenkins:
  ```bash
  curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2024.key | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
  echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y jenkins
  ```
- [ ] Start Jenkins: `sudo systemctl start jenkins`
- [ ] Enable Jenkins on boot: `sudo systemctl enable jenkins`
- [ ] Retrieve initial password: `sudo cat /var/lib/jenkins/secrets/initialAdminPassword`

### Task 4.3: Jenkins Configuration
**Priority**: HIGH

- [ ] Access Jenkins at `http://<EC2-IP>:8080`
- [ ] Complete initial setup wizard
- [ ] Install suggested plugins
- [ ] Create admin user
- [ ] Install additional plugins:
  - [ ] GitHub Integration
  - [ ] Docker
  - [ ] SonarQube Scanner
  - [ ] Pipeline
  - [ ] Blue Ocean

### Task 4.4: Jenkins Pipeline Creation
**Priority**: HIGH

- [ ] Create new Pipeline job: "MoraAI-Pipeline"
- [ ] Configure to use Git SCM: `https://github.com/<your-repo>/MORA_AI.git`
- [ ] Set branch: `*/main` or `*/develop`
- [ ] Pipeline definition: Load from SCM → Jenkinsfile
- [ ] Configure GitHub webhook (if using GitHub for Jenkins)

### Task 4.5: Jenkins Credentials Setup
**Priority**: HIGH

- [ ] GitHub credentials (for checkout)
- [ ] AWS credentials (for ECR access)
- [ ] SonarQube token (for SonarQube analysis)

---

## Phase 5: SonarQube Integration with Jenkins

### Task 5.1: Local SonarQube Setup (In Jenkins EC2)
**Priority**: HIGH

- [ ] Install Docker Compose on EC2
- [ ] Copy `docker-compose.sonarqube.yml` to EC2
- [ ] Start SonarQube + PostgreSQL:
  ```bash
  docker-compose -f docker-compose.sonarqube.yml up -d
  ```
- [ ] Wait for SonarQube to be ready (check logs): `docker logs -f sonarqube`
- [ ] Access SonarQube: `http://<EC2-IP>:9000` (login: admin/admin)

### Task 5.2: SonarQube Project Setup
**Priority**: HIGH

- [ ] Create project in SonarQube UI
- [ ] Generate project token
- [ ] Configure SonarQube as Manage Jenkins → Configure System → SonarQube servers
- [ ] Update Jenkinsfile to use local SonarQube
- [ ] Set environment variables in Jenkins:
  - [ ] `SONAR_HOST_URL = http://localhost:9000` (or internal URL)
  - [ ] `SONAR_TOKEN = <generated-token>`

### Task 5.3: First Jenkins Build with SonarQube
**Priority**: HIGH

- [ ] Trigger Jenkins build manually
- [ ] Verify SonarQube analysis stage runs
- [ ] Check SonarQube dashboard for project scan results
- [ ] Verify quality gate passes/fails appropriately

---

## Phase 6: GitHub Actions Local Configuration

### Task 6.1: Test GitHub Actions Workflow Locally
**Priority**: MEDIUM

- [ ] Verify `.github/workflows/ci.yml` syntax (fixed in Phase 1)
- [ ] Push changes to GitHub
- [ ] Trigger workflow manually via Actions tab
- [ ] Monitor workflow execution

### Task 6.2: GitHub Actions Credentials Setup
**Priority**: MEDIUM

- [ ] Add GitHub Secrets (if using external services):
  - [ ] `GRAFANA_URL` (optional, for Grafana annotations)
  - [ ] `GRAFANA_API_KEY` (optional)

### Task 6.3: Verify GitHub Actions Integration
**Priority**: MEDIUM

- [ ] Run full CI pipeline on GitHub
- [ ] Verify all jobs complete successfully:
  - [ ] pre-flight-check
  - [ ] backend-check
  - [ ] frontend-build
  - [ ] api-smoke
  - [ ] pipeline-incident-tracking
  - [ ] docker-build

---

## Phase 7: Monitoring & Observability

### Task 7.1: Prometheus Setup (Optional, In WSL)
**Priority**: LOW

- [ ] Verify Prometheus configuration: `monitoring/prometheus/prometheus.yml`
- [ ] Update target endpoints if needed
- [ ] Start Prometheus (via Docker or manual)

### Task 7.2: Grafana Setup (Optional, In WSL)
**Priority**: LOW

- [ ] Deploy Grafana dashboard
- [ ] Configure Prometheus data source
- [ ] Import MoraAI dashboards from `monitoring/grafana/dashboards/`

---

## Phase 8: End-to-End Verification

### Task 8.1: Local Application Tests
**Priority**: HIGH

- [ ] Backend health: `curl http://localhost:3000/health`
- [ ] Dashboard API: `curl http://localhost:3000/api/saas/dashboard`
- [ ] Pipeline API: `curl http://localhost:3000/api/pipelines`
- [ ] RCA providers: `curl http://localhost:3000/api/rca/providers`
- [ ] Browser test: http://localhost:3000 → Dashboard loads

### Task 8.2: Jenkins Pipeline Tests
**Priority**: HIGH

- [ ] Trigger build from Jenkins UI
- [ ] Monitor build progress in Jenkins UI
- [ ] Verify SonarQube analysis completes
- [ ] Check SonarQube dashboard for results
- [ ] Verify all logs in Jenkins (Backend health check, Docker build, etc.)

### Task 8.3: GitHub Actions Tests
**Priority**: HIGH

- [ ] Push to GitHub repository
- [ ] Verify CI workflow triggers
- [ ] Monitor GitHub Actions execution
- [ ] Verify all jobs pass
- [ ] Check incident tracking if enabled

### Task 8.4: Integration Tests
**Priority**: MEDIUM

- [ ] Send test RCA request: 
  ```bash
  curl -X POST http://localhost:3000/api/rca/analyze \
    -H 'Content-Type: application/json' \
    -d '{"logText":"Test failure","pipelineId":"P-1001"}'
  ```
- [ ] Trigger pipeline incident simulation
- [ ] Verify metrics collected in Prometheus (if running)

---

## Phase 9: Documentation & Handoff

### Task 9.1: Document Deployment Details
**Priority**: MEDIUM

- [ ] Record Jenkins URL and access credentials
- [ ] Record SonarQube URL and admin credentials
- [ ] Document EC2 instance details (IP, security group)
- [ ] Document GitHub Actions status and any manual triggers
- [ ] Update `docs/deployment-commands-guide.md` with new account ID

### Task 9.2: Create Troubleshooting Guide
**Priority**: LOW

- [ ] Common issues and solutions
- [ ] Log locations and inspection methods
- [ ] Health check procedures

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. AWS Account Migration | 5 | 🔴 Pending |
| 2. WSL Setup | 3 | 🔴 Pending |
| 3. Local Verification | 2 | 🔴 Pending |
| 4. Jenkins on AWS | 5 | 🔴 Pending |
| 5. SonarQube Integration | 3 | 🔴 Pending |
| 6. GitHub Actions | 3 | 🔴 Pending |
| 7. Monitoring | 2 | 🔴 Pending |
| 8. E2E Verification | 4 | 🔴 Pending |
| 9. Documentation | 2 | 🔴 Pending |

**Total Tasks**: 29  
**Estimated Duration**: 3-4 hours (depends on AWS provisioning time)

---

## Execution Notes

- ✅ AWS Account: `818825274841` (Terraform_User)
- ✅ WSL: Ubuntu
- ✅ Sudo Password: Provided
- ✅ Jenkins Target: AWS EC2
- ✅ SonarQube: Local Docker container in Jenkins EC2
- ✅ GitHub Actions: Local (WSL) for testing, can run on GitHub
- ⚠️ Terraform: Set to skip for now (no fresh infrastructure provisioning)

---

**Last Updated**: 2026-04-21  
**Next Step**: Begin Phase 1 - AWS Account ID Updates
