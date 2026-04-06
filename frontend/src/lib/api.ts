export type RCAProviderStatus = {
  configured?: boolean;
  status?: string;
  url?: string;
  model?: string;
};

export type Overview = {
  totalPipelines: number;
  totalRuns: number;
  avgSuccessRate: number;
  openIncidents: number;
  criticalIncidents: number;
  systemHealth: string;
};

export type Pipeline = {
  id: string;
  service: string;
  branch: string;
  status: string;
  runs: number;
  successRate: number;
  lastRunAt: string;
  latestLog: string;
};

export type Incident = {
  id: string;
  pipelineId: string;
  severity: string;
  category: string;
  explanation: string;
  remediation: string[];
  rawLog: string;
  rcaProvider: string;
  status: string;
  createdAt: string;
};

export type DashboardPayload = {
  overview: Overview;
  providers: Record<string, RCAProviderStatus>;
  incidents: Incident[];
  pipelines: Pipeline[];
};

export type TriggerPayload = {
  pipelineId: string;
  logText: string;
};

const base = import.meta.env.VITE_API_BASE_URL || "";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSaasDashboard() {
  return getJson<DashboardPayload>("/api/saas/dashboard");
}

export async function triggerSaasIncident(input: TriggerPayload) {
  return postJson<{ incident: Incident }>("/api/saas/trigger", input);
}

export async function approveSaasIncident(incidentId: string, approvedBy = "SaaS Operator") {
  return postJson<{ incident: Incident }>(`/api/saas/incidents/${incidentId}/approve`, { approvedBy });
}

export async function executeSaasIncident(incidentId: string) {
  return postJson<{ incident: Incident }>(`/api/saas/incidents/${incidentId}/execute`, {});
}
