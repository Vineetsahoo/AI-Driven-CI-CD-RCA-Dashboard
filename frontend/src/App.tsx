import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { Web3HeroAnimated } from "@/components/ui/animated-web3-landing-page";
import {
  approveSaasIncident,
  executeSaasIncident,
  fetchSaasDashboard,
  triggerSaasIncident,
  type DashboardPayload,
  type Incident,
  type Pipeline,
  type RCAProviderStatus
} from "@/lib/api";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Platform", to: "/platform" },
  { label: "Bedrock", to: "/bedrock" },
  { label: "Ollama", to: "/ollama" },
  { label: "Observability", to: "/observability" },
  { label: "Docs", to: "/docs" }
];

export default function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function loadDashboard() {
    setLoading(true);
    try {
      const payload = await fetchSaasDashboard();
      setData(payload);
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard data";
      setError(msg);
      console.error("Dashboard error:", msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    loadDashboard();
    const timer = setInterval(() => {
      if (active) loadDashboard();
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const pipelineOptions = useMemo(() => {
    return (data?.pipelines || []).slice(0, 3).map((p: Pipeline) => ({
      id: p.id,
      label: `${p.id} ${p.service}`
    }));
  }, [data]);

  async function handleTrigger(pipelineId: string) {
    try {
      setBusyId(pipelineId);
      await triggerSaasIncident({
        pipelineId,
        logText: `Forced failure for ${pipelineId}: Build failed due to invalid dependency lockfile.`
      });
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger incident");
    } finally {
      setBusyId("");
    }
  }

  async function handleApprove(incidentId: string) {
    try {
      setBusyId(incidentId);
      await approveSaasIncident(incidentId);
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve remediation");
    } finally {
      setBusyId("");
    }
  }

  async function handleExecute(incidentId: string) {
    try {
      setBusyId(incidentId);
      await executeSaasIncident(incidentId);
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to execute remediation");
    } finally {
      setBusyId("");
    }
  }

  const incidents: Incident[] = data?.incidents || [];

  return (
    <main className="bg-black text-white min-h-screen">
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              data={data}
              loading={loading}
              error={error}
              busyId={busyId}
              incidents={incidents}
              pipelineOptions={pipelineOptions}
              onTrigger={handleTrigger}
              onApprove={handleApprove}
              onExecute={handleExecute}
            />
          }
        />
        <Route
          path="/platform"
          element={
            <SubPageLayout title="Platform" subtitle="Control plane architecture, incident lifecycle, and deployment surfaces.">
              <div className="grid gap-5 md:grid-cols-2">
                <InfoCard
                  title="Unified RCA Control Plane"
                  body="MoraAI coordinates Bedrock Nova, Ollama, and local fallback through a single backend policy. Pipelines, incidents, and remediation history all live in one operational view."
                />
                <InfoCard
                  title="Approval-Centric Operations"
                  body="Detected incidents must be approved before remediation executes. This creates an auditable workflow and safer automation posture in production teams."
                />
                <InfoCard
                  title="Hybrid Deployment Support"
                  body="Run the same stack in local Docker, EC2 with Ansible, or EKS with Kubernetes manifests. Monitoring and RCA interfaces stay consistent across environments."
                />
                <InfoCard
                  title="Live Runbook UX"
                  body="Trigger pipelines, inspect severity and root-cause details, approve fixes, and execute remediation directly from the dashboard."
                />
              </div>
            </SubPageLayout>
          }
        />
        <Route
          path="/bedrock"
          element={
            <SubPageLayout title="Bedrock Path" subtitle="Cloud-first RCA route using Nova Lite through your RCA API.">
              <ProviderPanel providerName="bedrock" provider={data?.providers?.bedrock} />
              <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-semibold">Recommended GitHub Actions Secrets and Vars</h3>
                <ul className="mt-3 space-y-2 text-sm text-white/75">
                  <li>AWS_ROLE_TO_ASSUME secret for OIDC federation</li>
                  <li>AWS_REGION variable, EKS_CLUSTER_NAME variable, ECR_REPOSITORY variable</li>
                  <li>RCA API URL in Kubernetes secret to route Bedrock analysis endpoint</li>
                </ul>
              </div>
            </SubPageLayout>
          }
        />
        <Route
          path="/ollama"
          element={
            <SubPageLayout title="Ollama Path" subtitle="Local inference fallback with explicit model controls.">
              <ProviderPanel providerName="ollama" provider={data?.providers?.ollama} />
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <InfoCard
                  title="Runtime Flags"
                  body="Use OLLAMA_ENABLED=true to activate local model fallback, OLLAMA_URL to target service location, and OLLAMA_MODEL to control the active model."
                />
                <InfoCard
                  title="Compose Bootstrap"
                  body="The compose profile local-llm now supports pulling your configured OLLAMA_MODEL so first-run demos are reliable and repeatable."
                />
              </div>
            </SubPageLayout>
          }
        />
        <Route
          path="/observability"
          element={
            <SubPageLayout title="Observability" subtitle="Metrics, alerts, and RCA provider telemetry across every incident.">
              <div className="grid gap-5 md:grid-cols-3">
                <MetricTile label="Average Success" value={`${data?.overview.avgSuccessRate ?? 0}%`} tone="cyan" />
                <MetricTile label="Open Incidents" value={String(data?.overview.openIncidents ?? 0)} tone="amber" />
                <MetricTile label="Critical Incidents" value={String(data?.overview.criticalIncidents ?? 0)} tone="rose" />
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <InfoCard title="Prometheus" body="Scrapes the app metrics endpoint at /metrics and stores pipeline + RCA activity over time. Open it locally at http://localhost:9090." />
                <InfoCard title="Grafana" body="Reads from Prometheus and shows the MoraAI dashboard. Open it locally at http://localhost:3001 with admin / admin123." />
                <InfoCard title="Pipeline Activity" body="Trigger a pipeline from the Home page to generate incidents, change status, and populate the graphs and counters." />
              </div>
              <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-white/75">
                Metrics include HTTP request totals, pipeline outcomes, open incident gauge, RCA request counts by provider, provider health gauges, and last-request latency.
              </div>
            </SubPageLayout>
          }
        />
        <Route
          path="/docs"
          element={
            <SubPageLayout title="Documentation" subtitle="Fast links for deployment, architecture, and implementation workflows.">
              <div className="grid gap-5 md:grid-cols-2">
                <DocLink title="Project Flow" path="docs/project-flow.md" description="End-to-end explanation from trigger to remediation execution." />
                <DocLink
                  title="Deployment Commands Guide"
                  path="docs/deployment-commands-guide.md"
                  description="Command order for local, Docker, Terraform, EC2, and EKS paths."
                />
                <DocLink
                  title="Implementation Plan"
                  path="docs/implementation-plan.md"
                  description="MVP scope, staged execution strategy, and upgrade roadmap."
                />
                <DocLink
                  title="Bedrock Lambda Integration"
                  path="docs/bedrock-lambda-integration-guide.md"
                  description="Cloud RCA provider setup with Nova Lite and API integration."
                />
              </div>
            </SubPageLayout>
          }
        />
      </Routes>
    </main>
  );
}

type HomePageProps = {
  data: DashboardPayload | null;
  loading: boolean;
  error: string;
  busyId: string;
  incidents: Incident[];
  pipelineOptions: { id: string; label: string }[];
  onTrigger: (pipelineId: string) => void;
  onApprove: (incidentId: string) => void;
  onExecute: (incidentId: string) => void;
};

function HomePage({ data, loading, error, busyId, incidents, pipelineOptions, onTrigger, onApprove, onExecute }: HomePageProps) {
  return (
    <>
      <Web3HeroAnimated
        stats={{
          avgSuccessRate: data?.overview.avgSuccessRate ?? 0,
          openIncidents: data?.overview.openIncidents ?? 0,
          criticalIncidents: data?.overview.criticalIncidents ?? 0
        }}
        pipelineOptions={pipelineOptions}
        busyId={busyId}
        onTrigger={onTrigger}
      />

      <section id="live-data" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Live Monitoring Dashboard</h2>
          <p className="text-white/60">Real-time incident tracking and RCA provider status</p>
        </div>

        {loading && !data && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 backdrop-blur text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white"></div>
            <p className="mt-4 text-white/70">Loading dashboard data...</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <h2 className="mb-4 text-sm uppercase tracking-wide text-white/70">Provider Status</h2>
              <div className="space-y-2 text-sm">
                {Object.keys(data?.providers || {}).length === 0 && (
                  <p className="text-white/60">No provider data available.</p>
                )}
                {Object.entries(data?.providers || {}).map(([name, provider]) => (
                  <div key={name} className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div>
                      <span className="capitalize">{name}</span>
                      {provider.model && <p className="text-[11px] text-white/45">{provider.model}</p>}
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        provider.status === "available"
                          ? "bg-green-500/20 text-green-300"
                          : provider.status === "unknown"
                            ? "bg-white/10 text-white/60"
                            : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {provider.status || "unknown"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <h2 className="mb-4 text-sm uppercase tracking-wide text-white/70">Latest Incidents</h2>
              <div className="max-h-[380px] space-y-3 overflow-auto pr-1">
                {incidents.length === 0 && <p className="text-white/60">No incidents yet. Trigger one using the buttons above.</p>}
                {incidents.map((incident) => (
                  <div key={incident.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-white/70">
                      <span className="font-mono">{incident.id}</span>
                      <span
                        className={`uppercase font-semibold ${
                          incident.severity === "critical" ? "text-red-400" : incident.severity === "high" ? "text-orange-400" : "text-yellow-400"
                        }`}
                      >
                        {incident.severity}
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-white/60">Provider: {incident.rcaProvider}</p>
                    <p className="text-xs leading-5 text-white/80">{incident.rawLog}</p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button
                        className="rounded-full border border-white/25 px-3 py-1 text-xs disabled:opacity-40 hover:bg-white/5 transition"
                        disabled={busyId === incident.id || incident.status !== "detected"}
                        onClick={() => onApprove(incident.id)}
                      >
                        {busyId === incident.id ? "Working..." : "Approve"}
                      </button>
                      <button
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black disabled:opacity-40 hover:bg-white/90 transition"
                        disabled={busyId === incident.id || incident.status !== "approved"}
                        onClick={() => onExecute(incident.id)}
                      >
                        Execute
                      </button>
                      <span className="text-[11px] text-white/60 ml-auto">Status: {incident.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 backdrop-blur">
            <p className="text-sm text-red-400">
              {error}
              {error.includes("failed") && " - Make sure the backend server is running on port 3000 with `npm start`"}
            </p>
          </div>
        )}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <InfoCard
            title="Pipeline Trigger"
            body="Operators can trigger controlled failure scenarios for each seeded pipeline and validate incident detection behavior."
          />
          <InfoCard
            title="RCA Classification"
            body="Every failure is classified for category, severity, and failed stage using Bedrock, Ollama, and local fallback in priority order."
          />
          <InfoCard
            title="Remediation Workflow"
            body="Approval and execution actions model safe operations controls and return pipelines to healthy status after completion."
          />
        </div>
      </section>
    </>
  );
}

type SubPageLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

function SubPageLayout({ title, subtitle, children }: SubPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(130%_95%_at_50%_0%,rgba(19,56,122,0.35),rgba(4,6,12,1)_55%)]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-wide text-white/90">
            MoraAI NovaOps
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-xs text-white/70">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1 transition ${isActive ? "bg-white text-black" : "bg-white/5 hover:bg-white/15 text-white/80"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 max-w-3xl text-white/75">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </section>
    </div>
  );
}

function ProviderPanel({ providerName, provider }: { providerName: string; provider?: RCAProviderStatus }) {
  const statusClass =
    provider?.status === "available"
      ? "bg-green-500/20 text-green-300"
      : provider?.status === "pulling"
        ? "bg-amber-500/20 text-amber-300"
      : provider?.status === "disabled"
        ? "bg-white/10 text-white/70"
        : "bg-red-500/20 text-red-300";

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold capitalize">{providerName} Provider</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{provider?.status || "unknown"}</span>
      </div>
      <div className="mt-3 text-sm text-white/75">
        <p>Configured: {provider?.configured ? "yes" : "no"}</p>
        <p>Model: {provider?.model || "not set"}</p>
        <p>Endpoint: {provider?.url || "n/a"}</p>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/75">{body}</p>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: "cyan" | "amber" | "rose" }) {
  const toneMap = {
    cyan: "from-cyan-500/25 to-cyan-900/20",
    amber: "from-amber-500/25 to-amber-900/20",
    rose: "from-rose-500/25 to-rose-900/20"
  };

  return (
    <div className={`rounded-2xl border border-white/15 bg-gradient-to-b ${toneMap[tone]} p-5`}>
      <p className="text-xs uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function DocLink({ title, path, description }: { title: string; path: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:bg-white/10">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{description}</p>
      <p className="mt-4 text-xs uppercase tracking-wide text-cyan-300">{path}</p>
    </div>
  );
}
