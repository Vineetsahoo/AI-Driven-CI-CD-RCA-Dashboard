# PROJECT REPORT: AI-Driven CI/CD Pipeline Failure Analysis and Auto-Remediation System (MoraAI)

## 1. INTRODUCTION
### 1.1 Project Overview
MoraAI is an enterprise-grade platform for DevOps intelligence. It provides real-time failure analysis and remediation workflows powered by a multi-LLM fallback chain.

### 1.2 Problem Statement
DevOps teams spend excessive time debugging CI/CD logs. Manual Root Cause Analysis (RCA) is slow, inconsistent, and often misses infrastructure-level nuances.

### 1.3 Proposed System
An integrated dashboard that detects failures, classifies them via a Fallback RCA Engine, and provides actionable remediation steps.

---

## 2. SYSTEM ANALYSIS & DESIGN
### 2.1 Technical Stack
- **Frontend:** React, TypeScript, Tailwind
- **Backend:** Node.js (Express), Prometheus Registry
- **Infrastructure:** Terraform, AWS EKS, ECR
- **AI Engine:** AWS Bedrock, Ollama, Local Rule-Engine

---

## 3. IMPLEMENTATION DETAILS
### 3.1 Backend Configuration
The Express backend manages the incident lifecycle and metrics collection.

### 3.2 Frontend Dashboard
The React dashboard provides a SaaS-style interface for triggering and resolving incidents.

---

## APPENDIX A – IMPLEMENTATION

### A.1 Terraform Infrastructure
Infrastructure is managed as code for AWS resources.

```hcl
resource "aws_eks_cluster" "cppe" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster_role.arn
  vpc_config { subnet_ids = aws_subnet.private[*].id }
}
```
*Bottom: Figure A.1 Terraform Provisioning for AWS EKS*

### A.2 Docker Containerization
Standardized environment via Docker.

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
```
*Bottom: Figure A.2 Docker-Compose Orchestration Snippet*

---

## APPENDIX B – OUTPUTS

### B.1 Prometheus Metrics
Operational telemetry.

```text
# HELP cppe_incidents_open Number of non-resolved incidents
# TYPE cppe_incidents_open gauge
cppe_incidents_open 2
```
*Bottom: Figure B.1 Application Metrics Endpoint*

### B.2 Monitoring Dashboards
Visual analytics.

> **Status:** Dashboard showing 94% Success Rate and active RCA Latency.

*Bottom: Figure B.2 MoraAI Observability Dashboard*
