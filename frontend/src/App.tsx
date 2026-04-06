import { useEffect, useMemo, useState } from "react";
import { Web3HeroAnimated } from "@/components/ui/animated-web3-landing-page";
import {
  approveSaasIncident,
  executeSaasIncident,
  fetchSaasDashboard,
  triggerSaasIncident,
  type DashboardPayload,
  type Incident,
  type Pipeline
} from "@/lib/api";

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
      <Web3HeroAnimated
        stats={{
          avgSuccessRate: data?.overview.avgSuccessRate ?? 0,
          openIncidents: data?.overview.openIncidents ?? 0,
          criticalIncidents: data?.overview.criticalIncidents ?? 0
        }}
        pipelineOptions={pipelineOptions}
        busyId={busyId}
        onTrigger={handleTrigger}
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
                        onClick={() => handleApprove(incident.id)}
                      >
                        {busyId === incident.id ? "Working..." : "Approve"}
                      </button>
                      <button
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black disabled:opacity-40 hover:bg-white/90 transition"
                        disabled={busyId === incident.id || incident.status !== "approved"}
                        onClick={() => handleExecute(incident.id)}
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
      </section>
    </main>
  );
}
