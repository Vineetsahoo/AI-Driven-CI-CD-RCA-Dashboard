const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const client = require('prom-client');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ---------------------------------------------------------------------------
// Prometheus metrics registry
// ---------------------------------------------------------------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'cppe_' });

const httpRequestsTotal = new client.Counter({
  name: 'cppe_http_requests_total',
  help: 'Total number of HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status']
});

const pipelineRunsTotal = new client.Counter({
  name: 'cppe_pipeline_runs_total',
  help: 'Total number of pipeline runs by status',
  labelNames: ['pipeline', 'status']
});

const incidentsOpen = new client.Gauge({
  name: 'cppe_incidents_open',
  help: 'Number of non-resolved incidents'
});

const rcaRequestsTotal = new client.Counter({
  name: 'cppe_rca_requests_total',
  help: 'Total RCA analysis requests by provider and status',
  labelNames: ['provider', 'status']
});

const rcaLatency = new client.Gauge({
  name: 'cppe_rca_latency_seconds',
  help: 'Latency of last RCA analysis call in seconds',
  labelNames: ['provider']
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(pipelineRunsTotal);
register.registerMetric(incidentsOpen);
register.registerMetric(rcaRequestsTotal);
register.registerMetric(rcaLatency);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const RCA_API_URL = process.env.RCA_API_URL || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const OLLAMA_ENABLED = String(process.env.OLLAMA_ENABLED || 'true').toLowerCase() === 'true';
const OLLAMA_AUTO_PULL = String(process.env.OLLAMA_AUTO_PULL || 'true').toLowerCase() === 'true';
const PROVIDER_STATUS_CACHE_TTL_MS = Number(process.env.PROVIDER_STATUS_CACHE_TTL_MS || 30000);
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
const BEDROCK_RUNTIME_ROLE_ARN = process.env.BEDROCK_RUNTIME_ROLE_ARN || '';

const rcaProviderConfigured = new client.Gauge({
  name: 'cppe_rca_provider_configured',
  help: 'Whether an RCA provider is configured (1) or not (0)',
  labelNames: ['provider']
});

const rcaProviderUp = new client.Gauge({
  name: 'cppe_rca_provider_up',
  help: 'Whether an RCA provider endpoint is reachable (1) or not (0)',
  labelNames: ['provider']
});

register.registerMetric(rcaProviderConfigured);
register.registerMetric(rcaProviderUp);

let providerStatusCache = {
  bedrock: {
    configured: !!RCA_API_URL,
    url: RCA_API_URL || null,
    model: BEDROCK_MODEL_ID,
    status: RCA_API_URL ? 'unknown' : 'not-configured'
  },
  ollama: {
    configured: OLLAMA_ENABLED,
    url: OLLAMA_URL,
    model: OLLAMA_MODEL,
    models: [],
    status: OLLAMA_ENABLED ? 'unknown' : 'disabled'
  },
  local: { configured: true, status: 'available' }
};
let providerStatusLastFetchedAt = 0;
let providerStatusRefreshPromise = null;
let ollamaWarmupPromise = null;

function updateProviderHealthMetrics(providers) {
  rcaProviderConfigured.set({ provider: 'bedrock' }, providers.bedrock?.configured ? 1 : 0);
  rcaProviderConfigured.set({ provider: 'ollama' }, providers.ollama?.configured ? 1 : 0);
  rcaProviderConfigured.set({ provider: 'local' }, 1);

  rcaProviderUp.set({ provider: 'bedrock' }, providers.bedrock?.status === 'available' ? 1 : 0);
  rcaProviderUp.set({ provider: 'ollama' }, providers.ollama?.status === 'available' ? 1 : 0);
  rcaProviderUp.set({ provider: 'local' }, 1);
}

function normalizeOllamaModelName(name) {
  return String(name || '').trim();
}

function isOllamaModelAvailable(modelName, availableModels = []) {
  const normalizedTarget = normalizeOllamaModelName(modelName);
  if (!normalizedTarget) {
    return false;
  }

  return availableModels.some((name) => {
    const normalizedName = normalizeOllamaModelName(name);
    return normalizedName === normalizedTarget || normalizedName.startsWith(`${normalizedTarget}:`);
  });
}

function markOllamaUnavailable(status = 'unavailable', models = []) {
  providerStatusCache = {
    ...providerStatusCache,
    ollama: {
      ...providerStatusCache.ollama,
      configured: OLLAMA_ENABLED,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      models,
      status
    }
  };
  providerStatusLastFetchedAt = Date.now();
  updateProviderHealthMetrics(providerStatusCache);
}

async function fetchOllamaModels() {
  const ollamaRes = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 1500 });
  return (ollamaRes.data.models || []).map((model) => model.name);
}

function setOllamaStatus(status, models = []) {
  providerStatusCache = {
    ...providerStatusCache,
    ollama: {
      ...providerStatusCache.ollama,
      configured: OLLAMA_ENABLED,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      models,
      status
    }
  };
  providerStatusLastFetchedAt = Date.now();
  updateProviderHealthMetrics(providerStatusCache);
}

async function warmOllamaModel() {
  if (!OLLAMA_ENABLED || !OLLAMA_AUTO_PULL) {
    return providerStatusCache.ollama;
  }

  if (ollamaWarmupPromise) {
    return ollamaWarmupPromise;
  }

  ollamaWarmupPromise = (async () => {
    try {
      const models = await fetchOllamaModels();
      if (isOllamaModelAvailable(OLLAMA_MODEL, models)) {
        setOllamaStatus('available', models);
        return providerStatusCache.ollama;
      }

      setOllamaStatus('pulling', models);
      await axios.post(
        `${OLLAMA_URL}/api/pull`,
        { model: OLLAMA_MODEL, stream: false },
        { timeout: 1200000 }
      );

      const refreshedModels = await fetchOllamaModels();
      const status = isOllamaModelAvailable(OLLAMA_MODEL, refreshedModels) ? 'available' : 'model-missing';
      setOllamaStatus(status, refreshedModels);
      return providerStatusCache.ollama;
    } catch (err) {
      setOllamaStatus('unavailable');
      console.warn('[RCA] Ollama auto-pull failed:', err.message);
      return providerStatusCache.ollama;
    } finally {
      ollamaWarmupPromise = null;
    }
  })();

  return ollamaWarmupPromise;
}

async function refreshRCAProvidersStatus() {
  const providers = {
    bedrock: {
      configured: !!RCA_API_URL,
      url: RCA_API_URL || null,
      model: BEDROCK_MODEL_ID,
      status: 'unknown'
    },
    ollama: { configured: OLLAMA_ENABLED, url: OLLAMA_URL, model: OLLAMA_MODEL, status: OLLAMA_ENABLED ? 'unknown' : 'disabled' },
    local: { configured: true, status: 'available' }
  };

  if (OLLAMA_ENABLED) {
    try {
      providers.ollama.models = await fetchOllamaModels();
      providers.ollama.status = isOllamaModelAvailable(OLLAMA_MODEL, providers.ollama.models)
        ? 'available'
        : 'pulling';

      if (providers.ollama.status === 'pulling') {
        void warmOllamaModel();
      }
    } catch {
      providers.ollama.status = 'unavailable';
    }
  }

  if (RCA_API_URL) {
    try {
      const healthUrl = RCA_API_URL.includes('/analyze') ? RCA_API_URL.replace('/analyze', '/health') : RCA_API_URL;
      const probe = await axios.get(healthUrl, {
        timeout: 5000,
        validateStatus: () => true
      });
      providers.bedrock.status = probe.status < 500 ? 'available' : 'unreachable';
    } catch {
      providers.bedrock.status = 'unreachable';
    }
  } else {
    providers.bedrock.status = 'not-configured';
  }

  providerStatusCache = providers;
  providerStatusLastFetchedAt = Date.now();
  updateProviderHealthMetrics(providers);
  return providers;
}

function getRCAProvidersStatus() {
  const stale = Date.now() - providerStatusLastFetchedAt >= PROVIDER_STATUS_CACHE_TTL_MS;
  if (stale && !providerStatusRefreshPromise) {
    providerStatusRefreshPromise = refreshRCAProvidersStatus().finally(() => {
      providerStatusRefreshPromise = null;
    });
  }
  return providerStatusCache;
}

// Warm the status cache without blocking startup routes.
refreshRCAProvidersStatus().catch(() => {});
void warmOllamaModel();

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------
function normalizeRoute(pathname) {
  return pathname
    .replace(/I-\d{6,}/g, ':incidentId')
    .replace(/P-\d{4,}/g, ':pipelineId');
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: normalizeRoute(req.path),
      status: String(res.statusCode)
    });
  });
  next();
});

// Disable caching during development demos to avoid stale frontend scripts.
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const reactDistPath = path.join(__dirname, 'frontend', 'dist');
const staticRootPath = reactDistPath;

app.use(
  express.static(staticRootPath, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  })
);

// ---------------------------------------------------------------------------
// Pipeline stage definitions
// ---------------------------------------------------------------------------
const stageBlueprint = ['Code Integration', 'Build', 'Test', 'Containerize', 'Deploy'];

const failureCatalog = [
  {
    key: 'build',
    signature: /compile|syntax|module not found|build failed/i,
    severity: 'high',
    stage: 'Build',
    remediation: [
      'Re-run dependency installation and lock versions in package manifest',
      'Fix compilation errors and verify branch build locally',
      'Add build cache cleanup step before compile'
    ]
  },
  {
    key: 'test',
    signature: /assertion|test failed|integration timeout|coverage/i,
    severity: 'medium',
    stage: 'Test',
    remediation: [
      'Inspect failed test suite and stabilize flaky tests',
      'Increase test timeout budget for integration scenarios',
      'Enforce pre-merge test checks in pull requests'
    ]
  },
  {
    key: 'config',
    signature: /invalid yaml|manifest|env var|configuration/i,
    severity: 'high',
    stage: 'Deploy',
    remediation: [
      'Validate manifest schema before deployment',
      'Add environment variable validation gate in pipeline',
      'Use dry-run deployment for Kubernetes manifests'
    ]
  },
  {
    key: 'dependency',
    signature: /version conflict|dependency|peer dep|lockfile/i,
    severity: 'medium',
    stage: 'Build',
    remediation: [
      'Pin dependency versions and regenerate lockfile',
      'Run vulnerability and compatibility checks',
      'Separate build-time and runtime dependencies'
    ]
  },
  {
    key: 'infrastructure',
    signature: /oomkilled|insufficient memory|cpu throttling|resource quota/i,
    severity: 'critical',
    stage: 'Deploy',
    remediation: [
      'Increase memory request and limit for affected workloads',
      'Apply horizontal pod autoscaling policy',
      'Add pre-deployment resource capacity check'
    ]
  }
];

// ---------------------------------------------------------------------------
// Seeded pipeline data
// ---------------------------------------------------------------------------
const seededPipelines = [
  {
    id: 'P-1001',
    service: 'payment-gateway',
    branch: 'main',
    status: 'healthy',
    runs: 42,
    successRate: 92,
    lastRunAt: new Date().toISOString(),
    latestLog: 'Pipeline completed successfully with all gates green.'
  },
  {
    id: 'P-1002',
    service: 'inventory-service',
    branch: 'release/1.8',
    status: 'degraded',
    runs: 37,
    successRate: 84,
    lastRunAt: new Date(Date.now() - 5400000).toISOString(),
    latestLog: 'Deployment delayed due to resource quota warning in staging namespace.'
  },
  {
    id: 'P-1003',
    service: 'analytics-collector',
    branch: 'develop',
    status: 'healthy',
    runs: 29,
    successRate: 89,
    lastRunAt: new Date(Date.now() - 12600000).toISOString(),
    latestLog: 'Unit and integration suites passed. Artifact pushed to registry.'
  }
];

const incidentState = [];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
function syncIncidentGauge() {
  const openCount = incidentState.filter((incident) => incident.status !== 'resolved').length;
  incidentsOpen.set(openCount);
}

function classifyFailure(logText) {
  const match = failureCatalog.find((item) => item.signature.test(logText));
  const category = match || failureCatalog[1];

  return {
    category: category.key,
    stage: category.stage,
    severity: category.severity,
    remediation: category.remediation,
    explanation:
      `Likely ${category.key} issue detected at ${category.stage} stage. ` +
      'Analysis correlates error signatures with historical CI/CD failure patterns and recommends controlled remediation.',
    provider: 'local'
  };
}

function stageSnapshot(failedStage) {
  return stageBlueprint.map((stage) => {
    if (!failedStage) {
      return { stage, state: 'passed' };
    }
    if (stage === failedStage) {
      return { stage, state: 'failed' };
    }
    const failedIndex = stageBlueprint.indexOf(failedStage);
    const currentIndex = stageBlueprint.indexOf(stage);
    if (currentIndex < failedIndex) {
      return { stage, state: 'passed' };
    }
    return { stage, state: 'skipped' };
  });
}

function createFailureLog() {
  const logs = [
    'Build failed: Module not found error while compiling service dependencies.',
    'Test failed: Assertion mismatch in checkout workflow integration suite.',
    'Deploy blocked: Invalid YAML manifest and missing environment variables.',
    'Build failed: Version conflict detected in dependency lockfile.',
    'Deployment failed: Pod terminated with OOMKilled due to memory limits.'
  ];
  return logs[Math.floor(Math.random() * logs.length)];
}

function computeOverview() {
  const totalRuns = seededPipelines.reduce((sum, pipeline) => sum + pipeline.runs, 0);
  const avgSuccessRate =
    seededPipelines.reduce((sum, pipeline) => sum + pipeline.successRate, 0) / seededPipelines.length;
  const openIncidents = incidentState.filter((incident) => incident.status !== 'resolved').length;
  const criticalIncidents = incidentState.filter(
    (incident) => incident.severity === 'critical' && incident.status !== 'resolved'
  ).length;

  return {
    totalPipelines: seededPipelines.length,
    totalRuns,
    avgSuccessRate: Number(avgSuccessRate.toFixed(1)),
    openIncidents,
    criticalIncidents,
    systemHealth: openIncidents > 0 ? 'attention-required' : 'stable'
  };
}

// ---------------------------------------------------------------------------
// RCA Analysis Engine (Bedrock → Ollama → Local fallback)
// ---------------------------------------------------------------------------
async function analyzeWithBedrock(logText, pipelineId) {
  if (!RCA_API_URL) throw new Error('RCA_API_URL not configured');

  const start = Date.now();
  const response = await axios.post(RCA_API_URL, { logText, pipelineId }, { timeout: 30000 });
  const latency = (Date.now() - start) / 1000;

  rcaLatency.set({ provider: 'bedrock' }, latency);
  rcaRequestsTotal.inc({ provider: 'bedrock', status: 'success' });

  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const payload =
    data && typeof data === 'object' && typeof data.body === 'string'
      ? JSON.parse(data.body)
      : data;

  if (data && typeof data === 'object' && typeof data.statusCode === 'number' && data.statusCode >= 400) {
    throw new Error(payload?.message || payload?.error || `Bedrock provider returned ${data.statusCode}`);
  }

  const analysis = payload.analysis || payload;

  return {
    ...analysis,
    provider: payload.provider || 'bedrock',
    model: payload.model || BEDROCK_MODEL_ID,
    latency
  };
}

async function analyzeWithOllama(logText, pipelineId) {
  const prompt = `You are a DevOps Root Cause Analysis assistant. Analyze this CI/CD failure log and return ONLY valid JSON (no markdown, no code fences) with keys: category (build/test/config/dependency/infrastructure), severity (critical/high/medium/low), failedStage (Code Integration/Build/Test/Containerize/Deploy), explanation (2-3 sentences), remediation (array of 3 steps).

Pipeline: ${pipelineId}
Log: ${logText}`;

  const start = Date.now();

  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 500 }
    },
    { timeout: 120000 }
  );

  const latency = (Date.now() - start) / 1000;
  rcaLatency.set({ provider: 'ollama' }, latency);
  rcaRequestsTotal.inc({ provider: 'ollama', status: 'success' });

  const text = response.data.response || '{}';
  let analysis;
  try {
    analysis = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Ollama returned non-JSON response');
    }
  }

  return {
    ...analysis,
    provider: 'ollama',
    model: OLLAMA_MODEL,
    latency
  };
}

async function performRCA(logText, pipelineId) {
  // Strategy: try Bedrock first, then Ollama, then local fallback
  // 1. Try Bedrock (via Lambda API Gateway)
  if (RCA_API_URL) {
    try {
      console.log('[RCA] Attempting Bedrock analysis...');
      return await analyzeWithBedrock(logText, pipelineId);
    } catch (err) {
      console.warn('[RCA] Bedrock failed, falling back:', err.message);
      rcaRequestsTotal.inc({ provider: 'bedrock', status: 'error' });
    }
  }

  // 2. Try Ollama (local LLM)
  if (OLLAMA_ENABLED) {
    const providerStatus = getRCAProvidersStatus();
    const ollamaStatus = providerStatus.ollama?.status;

    if (ollamaStatus === 'pulling') {
      console.log(`[RCA] Ollama model ${OLLAMA_MODEL} is being pulled; using local fallback for now`);
    } else if (ollamaStatus !== 'available') {
      console.log(
        `[RCA] Ollama is ${ollamaStatus || 'unknown'} for model ${OLLAMA_MODEL}; skipping to local fallback`
      );
    } else {
      try {
        console.log('[RCA] Attempting Ollama analysis...');
        return await analyzeWithOllama(logText, pipelineId);
      } catch (err) {
        console.warn('[RCA] Ollama failed, falling back to local:', err.message);
        rcaRequestsTotal.inc({ provider: 'ollama', status: 'error' });

        if (err.response && err.response.status === 404) {
          void warmOllamaModel();
          markOllamaUnavailable('pulling');
        } else {
          markOllamaUnavailable('unavailable');
        }
      }
    }
  } else {
    console.log('[RCA] Ollama disabled by configuration, skipping to local fallback');
  }

  // 3. Local rule-based fallback
  console.log('[RCA] Using local rule-based classifier');
  rcaRequestsTotal.inc({ provider: 'local', status: 'success' });
  return classifyFailure(logText);
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.get('/api/roadmap', (_req, res) => {
  res.json({
    phases: [
      'Build stable frontend and backend baseline',
      'Introduce controlled CI/CD failure simulation',
      'Analyze and classify failures by category and stage',
      'Apply approval-based remediation actions',
      'Validate system behavior and dashboard reporting'
    ]
  });
});

app.get('/api/overview', (_req, res) => {
  syncIncidentGauge();
  res.json(computeOverview());
});

app.get('/api/saas/dashboard', async (_req, res) => {
  syncIncidentGauge();
  try {
    const providers = getRCAProvidersStatus();
    const incidents = [...incidentState].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);

    res.json({
      overview: computeOverview(),
      providers,
      incidents,
      pipelines: seededPipelines
    });
  } catch (err) {
    console.error('[Dashboard] Error:', err);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: err.message,
      overview: computeOverview(),
      providers: providerStatusCache,
      incidents: [...incidentState].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
      pipelines: seededPipelines
    });
  }
});

app.get('/api/pipelines', (_req, res) => {
  res.json(seededPipelines);
});

app.get('/api/incidents', (_req, res) => {
  syncIncidentGauge();
  const sorted = [...incidentState].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sorted);
});

app.get('/api/incidents/:id', (req, res) => {
  const incident = incidentState.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }
  return res.json(incident);
});

// RCA Provider Status
app.get('/api/rca/providers', (_req, res) => {
  const providers = getRCAProvidersStatus();
  res.json(providers);
});

app.get('/api/rca/architecture', (_req, res) => {
  res.json({
    flow: [
      'Frontend triggers pipeline run',
      'Backend performRCA() tries Bedrock Nova via Lambda/API URL first',
      'On Bedrock failure, backend falls back to Ollama',
      'On Ollama failure, backend uses local rule-based classifier'
    ],
    bedrock: {
      configured: !!RCA_API_URL,
      apiUrl: RCA_API_URL || null,
      model: BEDROCK_MODEL_ID,
      runtimeRoleArn: BEDROCK_RUNTIME_ROLE_ARN || null,
      status: providerStatusCache.bedrock?.status || 'unknown'
    },
    ollama: {
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      status: providerStatusCache.ollama?.status || 'unknown'
    },
    local: {
      status: 'available'
    }
  });
});

// Direct RCA Analysis Endpoint
app.post('/api/rca/analyze', async (req, res) => {
  const { logText, pipelineId } = req.body;
  if (!logText) {
    return res.status(400).json({ error: 'logText is required' });
  }

  try {
    const analysis = await performRCA(logText, pipelineId || 'manual');
    return res.json(analysis);
  } catch (err) {
    console.error('[RCA] All providers failed:', err);
    return res.status(500).json({ error: 'RCA analysis failed', message: err.message });
  }
});

// Pipeline Run (with integrated RCA)
app.post('/api/pipelines/:id/run', async (req, res) => {
  const pipeline = seededPipelines.find((item) => item.id === req.params.id);
  if (!pipeline) {
    return res.status(404).json({ message: 'Pipeline not found.' });
  }

  const forceFail = req.body?.forceFail === true;
  const failed = forceFail || Math.random() < 0.62;
  const failureLogOverride = typeof req.body?.failureLog === 'string' ? req.body.failureLog.trim() : '';
  pipeline.runs += 1;
  pipeline.lastRunAt = new Date().toISOString();

  if (!failed) {
    pipeline.status = 'healthy';
    pipeline.successRate = Math.min(99, pipeline.successRate + 1);
    pipeline.latestLog = 'Pipeline execution successful. All stages passed and deployment completed.';
    pipelineRunsTotal.inc({ pipeline: pipeline.id, status: 'passed' });

    return res.json({
      pipeline,
      result: {
        status: 'passed',
        stages: stageSnapshot(),
        message: 'Pipeline passed. No failure detected.'
      }
    });
  }

  const failureLog = failureLogOverride || createFailureLog();

  // Use AI-powered RCA (with fallback chain)
  const analysis = await performRCA(failureLog, pipeline.id);

  pipeline.status = analysis.severity === 'critical' ? 'critical' : 'degraded';
  pipeline.successRate = Math.max(40, pipeline.successRate - 2);
  pipeline.latestLog = failureLog;

  const incident = {
    id: `I-${Date.now().toString().slice(-6)}`,
    pipelineId: pipeline.id,
    service: pipeline.service,
    branch: pipeline.branch,
    status: 'detected',
    severity: analysis.severity,
    category: analysis.category,
    failedStage: analysis.failedStage || analysis.stage,
    explanation: analysis.explanation,
    remediation: analysis.remediation,
    rawLog: failureLog,
    rcaProvider: analysis.provider || 'local',
    rcaModel: analysis.model || null,
    rcaLatency: analysis.latency || null,
    approval: {
      required: true,
      approvedBy: null,
      approvedAt: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  incidentState.push(incident);
  syncIncidentGauge();
  pipelineRunsTotal.inc({ pipeline: pipeline.id, status: 'failed' });

  return res.json({
    pipeline,
    incident,
    result: {
      status: 'failed',
      stages: stageSnapshot(analysis.failedStage || analysis.stage),
      message: `Pipeline failed. Incident generated with ${analysis.provider}-powered RCA.`
    }
  });
});

app.post('/api/saas/trigger', async (req, res) => {
  const { pipelineId, logText } = req.body || {};

  if (!pipelineId || typeof pipelineId !== 'string') {
    return res.status(400).json({ message: 'pipelineId is required.' });
  }

  const pipeline = seededPipelines.find((item) => item.id === pipelineId);
  if (!pipeline) {
    return res.status(404).json({ message: 'Pipeline not found.' });
  }

  pipeline.runs += 1;
  pipeline.lastRunAt = new Date().toISOString();

  const failureLog = typeof logText === 'string' && logText.trim() ? logText.trim() : createFailureLog();
  const analysis = await performRCA(failureLog, pipeline.id);

  pipeline.status = analysis.severity === 'critical' ? 'critical' : 'degraded';
  pipeline.successRate = Math.max(40, pipeline.successRate - 2);
  pipeline.latestLog = failureLog;

  const incident = {
    id: `I-${Date.now().toString().slice(-6)}`,
    pipelineId: pipeline.id,
    service: pipeline.service,
    branch: pipeline.branch,
    status: 'detected',
    severity: analysis.severity,
    category: analysis.category,
    failedStage: analysis.failedStage || analysis.stage,
    explanation: analysis.explanation,
    remediation: analysis.remediation,
    rawLog: failureLog,
    rcaProvider: analysis.provider || 'local',
    rcaModel: analysis.model || null,
    rcaLatency: analysis.latency || null,
    approval: {
      required: true,
      approvedBy: null,
      approvedAt: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  incidentState.push(incident);
  syncIncidentGauge();
  pipelineRunsTotal.inc({ pipeline: pipeline.id, status: 'failed' });

  return res.json({
    pipeline,
    incident,
    result: {
      status: 'failed',
      stages: stageSnapshot(analysis.failedStage || analysis.stage),
      message: `Pipeline failed. Incident generated with ${analysis.provider}-powered RCA.`
    }
  });
});

app.post('/api/saas/incidents/:id/approve', (req, res) => {
  const incident = incidentState.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }

  const approver = req.body?.approvedBy || 'SaaS Operator';
  incident.status = 'approved';
  incident.approval.approvedBy = approver;
  incident.approval.approvedAt = new Date().toISOString();
  incident.updatedAt = new Date().toISOString();
  syncIncidentGauge();

  return res.json({ message: 'Incident approved.', incident });
});

app.post('/api/saas/incidents/:id/execute', (req, res) => {
  const incident = incidentState.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }
  if (!incident.approval.approvedAt) {
    return res.status(400).json({ message: 'Approval required before execution.' });
  }

  const pipeline = seededPipelines.find((item) => item.id === incident.pipelineId);
  incident.status = 'resolved';
  incident.updatedAt = new Date().toISOString();
  syncIncidentGauge();

  if (pipeline) {
    pipeline.status = 'healthy';
    pipeline.successRate = Math.min(99, pipeline.successRate + 3);
    pipeline.latestLog = 'Remediation executed successfully. Service restored.';
    pipeline.lastRunAt = new Date().toISOString();
  }

  return res.json({ message: 'Incident resolved.', incident, pipeline });
});

app.post('/api/incidents/:id/approve-remediation', (req, res) => {
  const incident = incidentState.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }

  const approver = req.body?.approvedBy || 'DevOps Lead';
  incident.status = 'approved';
  incident.approval.approvedBy = approver;
  incident.approval.approvedAt = new Date().toISOString();
  incident.updatedAt = new Date().toISOString();
  syncIncidentGauge();

  return res.json({ message: 'Remediation approved.', incident });
});

app.post('/api/incidents/:id/execute-remediation', (req, res) => {
  const incident = incidentState.find((item) => item.id === req.params.id);
  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }
  if (!incident.approval.approvedAt) {
    return res.status(400).json({ message: 'Approval required before execution.' });
  }

  const pipeline = seededPipelines.find((item) => item.id === incident.pipelineId);
  incident.status = 'resolved';
  incident.updatedAt = new Date().toISOString();
  syncIncidentGauge();

  if (pipeline) {
    pipeline.status = 'healthy';
    pipeline.successRate = Math.min(99, pipeline.successRate + 3);
    pipeline.latestLog = 'Remediation executed successfully. Service restored.';
    pipeline.lastRunAt = new Date().toISOString();
  }

  return res.json({ message: 'Remediation executed successfully.', incident, pipeline });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get(/.*/, (_req, res) => {
  if (!fs.existsSync(path.join(staticRootPath, 'index.html'))) {
    return res.status(503).send('Frontend build not found. Run: npm --prefix frontend run build');
  }
  res.sendFile(path.join(staticRootPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`CI/CD intelligence platform running on http://${HOST}:${PORT}`);
  console.log(`RCA providers: Bedrock=${RCA_API_URL ? 'configured' : 'disabled'}, Ollama=${OLLAMA_URL}, Local=enabled`);
});

// Keep provider health metrics fresh for dashboards and alerts.
setInterval(() => {
  void getRCAProvidersStatus();
}, 60000);

void getRCAProvidersStatus();
