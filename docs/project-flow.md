# Project Flow

This document explains the project from start to finish so the full working model is easy to explain in a demo or handoff.

## 1. What the project does

MoraAI is an AI-driven CI/CD failure analysis platform. It shows a live dashboard for pipeline health, triggers simulated failures, analyzes the failure with an RCA engine, and lets an operator approve and execute remediation.

The app is built as:

- A React + TypeScript frontend under `frontend/`
- An Express backend in `server.js`
- Monitoring support through Prometheus metrics at `/metrics`
- Deployment support through Docker, Ansible, Terraform, and Kubernetes manifests

## 2. How the application starts

When you run the project locally, the backend starts first and serves the API on port `3000`. If the frontend is built, the same Express server also serves the static frontend bundle from `frontend/dist`.

Typical startup flow:

1. Install dependencies for the root app and the frontend.
2. Build the frontend bundle.
3. Start the Express server with `npm start`.
4. Open the dashboard in the browser.

In development, the frontend can also run separately on Vite while it talks to the backend through API calls.

## 3. What happens in the browser

The browser opens the main React app from `frontend/src/App.tsx`. That component loads the dashboard, refreshes it every 15 seconds, and renders the live state.

The UI has two main jobs:

- Show the current system overview, provider status, and latest incidents
- Let the user trigger a new pipeline failure, approve remediation, and execute remediation

The hero section also provides quick trigger buttons so you can create a demo incident immediately.

## 4. Frontend to backend request flow

The frontend does not compute the business logic itself. It calls the backend through `frontend/src/lib/api.ts`.

The main API calls are:

- `GET /api/saas/dashboard` to load the current dashboard data
- `POST /api/saas/trigger` to simulate a failed pipeline run
- `POST /api/saas/incidents/:id/approve` to approve remediation
- `POST /api/saas/incidents/:id/execute` to resolve the incident

That means the frontend is mainly responsible for presentation and user action, while the backend owns the incident lifecycle and RCA processing.

## 4.1 Data Flow Diagram

This is the simplest way to picture the project data flow:

```text
Browser / React UI
	|
	| fetchSaasDashboard(), triggerSaasIncident(), approveSaasIncident(), executeSaasIncident()
	v
Express API in server.js
	|
	| loads pipelines, incidents, provider status
	| creates or updates incidents
	v
RCA Engine
   |        |         |
   |        |         |
   v        v         v
Bedrock   Ollama    Local rule-based fallback
   \        |         /
    \       |        /
     \      |       /
      v     v      v
   Classification result
	|
	| category, severity, failed stage, explanation, remediation
	v
Incident state in memory
	|
	| detected -> approved -> resolved
	v
Updated dashboard + Prometheus metrics
```

In short: the UI sends actions, the backend processes them, the RCA engine classifies the failure, and the dashboard shows the updated result.

## 5. Pipeline and incident flow

The backend keeps a small set of seeded pipelines in memory so the app has realistic data right away. When a pipeline is triggered, the backend updates the pipeline run count, records the latest log, and decides whether the run passed or failed.

If the run passes:

- The pipeline stays healthy
- The success rate increases slightly
- No incident is created

If the run fails:

- The backend creates an incident with a unique ID
- The incident is marked as `detected`
- The failure is classified by category, severity, and failed stage
- Remediation steps are attached to the incident
- The pipeline status changes to degraded or critical depending on severity

This is the core demo loop: trigger, detect, classify, approve, and resolve.

## 6. Root cause analysis flow

The RCA engine is implemented in `server.js` and uses a fallback chain.

The order is:

1. Bedrock-based RCA through the configured `RCA_API_URL`
2. Ollama local model inference if enabled
3. Local rule-based classification if both model paths fail

That fallback structure makes the system resilient. Even if the cloud model is unavailable, the demo still works and always produces a result.

The classifier returns the following information:

- Failure category such as build, test, config, dependency, or infrastructure
- Severity such as low, medium, high, or critical
- The stage where the failure likely happened
- A human-readable explanation
- A list of remediation steps

## 7. Incident lifecycle

Once an incident is created, it moves through a simple approval workflow.

1. `detected` - the failure has been found and classified
2. `approved` - an operator has approved the remediation
3. `resolved` - the remediation has been executed successfully

The approval step matters because the app models a controlled operations process. Remediation cannot run until the incident has been approved.

When execution happens, the backend also updates the related pipeline back to a healthy state and adjusts the latest log to show recovery.

## 8. Monitoring and observability

The backend publishes Prometheus metrics at `/metrics`.

These metrics track:

- Total HTTP requests
- Pipeline run outcomes
- Open incidents
- RCA request counts by provider
- RCA latency for the last provider call
- Provider configuration and availability

The dashboard also exposes provider status through `/api/saas/dashboard` and `/api/rca/providers`, so the UI can show whether Bedrock, Ollama, or local fallback is active.

## 9. Deployment paths

The repository supports more than one way to run the system.

- Local development: run the backend and frontend separately
- Docker: run the app and monitoring stack together
- EC2: provision and deploy with Ansible
- EKS: push an image and apply Kubernetes manifests
- Terraform: create the AWS infrastructure used by the stack

That means the same project can be shown as a local demo, a containerized stack, or a cloud-deployed platform.

## 10. End-to-end demo story

If you need to explain the whole product in one pass, use this story:

1. The browser opens the React dashboard.
2. The dashboard calls the Express API for live pipeline and incident data.
3. A pipeline failure is triggered from the UI.
4. The backend simulates the failure and sends the log through the RCA chain.
5. The RCA engine classifies the issue and creates an incident.
6. The operator reviews the explanation and remediation steps.
7. The operator approves remediation.
8. The backend executes remediation and marks the incident resolved.
9. The dashboard refreshes and shows the recovered system state.

## 11. Key files to remember

- `server.js` contains the backend API, RCA logic, incident workflow, and metrics
- `frontend/src/App.tsx` contains the dashboard UI and user actions
- `frontend/src/lib/api.ts` contains the frontend API client
- `frontend/src/components/ui/animated-web3-landing-page.tsx` contains the landing hero and trigger controls
- `docs/implementation-plan.md` describes the original product goals and demo flow

## 12. Short explanation for demos

If someone asks what the project does, you can say:

MoraAI is a CI/CD intelligence platform that shows pipeline health, simulates failures, uses an RCA engine to classify the root cause, and lets an operator approve and execute remediation while the system stays observable through metrics and live dashboard updates.
