import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION || process.env.AWS_REGION_NAME || "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const client = new BedrockRuntimeClient({ region });

function parseJsonMaybe(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallback;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return fallback;
    }
  }
}

function extractModelText(raw) {
  const novaText = raw?.output?.message?.content
    ?.map((chunk) => chunk?.text || "")
    .join("")
    .trim();

  if (novaText) {
    return novaText;
  }

  const anthropicText = raw?.content?.[0]?.text?.trim();
  if (anthropicText) {
    return anthropicText;
  }

  const otherText = raw?.results?.[0]?.outputText?.trim() || raw?.generation?.trim();
  if (otherText) {
    return otherText;
  }

  return "{}";
}

function buildPrompt(logText, pipelineId) {
  return `You are a DevOps Root Cause Analysis assistant specialized in CI/CD pipeline failures.

Analyze the following CI/CD failure log and return ONLY a valid JSON object (no markdown, no code fences) with these exact keys:
- "category": one of "build", "test", "config", "dependency", "infrastructure"
- "severity": one of "critical", "high", "medium", "low"
- "failedStage": one of "Code Integration", "Build", "Test", "Containerize", "Deploy"
- "explanation": a clear 2-3 sentence explanation of the root cause
- "remediation": an array of exactly 3 actionable remediation steps

Pipeline ID: ${pipelineId}
Failure Log: ${logText}`;
}

function buildModelPayload(prompt) {
  if (modelId.startsWith("amazon.nova")) {
    return {
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ],
      system: [
        {
          text: "You are a precise DevOps RCA assistant. Return strict JSON only."
        }
      ],
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0.2,
        topP: 0.9
      }
    };
  }

  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 500,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }]
      }
    ]
  };
}

export const handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || event?.httpMethod || "POST";
    const path = event?.rawPath || event?.path || "/";

    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        },
        body: ""
      };
    }

    if (method === "GET" && (path === "/" || path === "/health")) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ status: "ok", provider: "bedrock" })
      };
    }

    const body = typeof event.body === "string"
      ? parseJsonMaybe(event.body, {})
      : (event.body || event || {});

    const logText = body.logText || "";
    const pipelineId = body.pipelineId || "unknown";

    if (!logText) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "logText is required" })
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(buildModelPayload(buildPrompt(logText, pipelineId)))
    });

    const response = await client.send(command);
    const raw = JSON.parse(new TextDecoder().decode(response.body));
    const text = extractModelText(raw);
    const analysis = parseJsonMaybe(text, {
      category: "unknown",
      severity: "medium",
      failedStage: "Build",
      explanation: text,
      remediation: ["Review the failure log manually", "Check pipeline configuration", "Contact DevOps team"]
    });

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        provider: "bedrock",
        model: modelId,
        analysis
      })
    };
  } catch (error) {
    console.error("RCA Lambda error:", error);
    return {
      statusCode: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ 
        error: "RCA analysis failed",
        message: error.message,
        provider: "bedrock"
      })
    };
  }
};
