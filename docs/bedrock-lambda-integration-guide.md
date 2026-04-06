# Bedrock + Lambda Integration Guide

This guide maps Bedrock and Lambda integration to your current CPPE architecture.

## 1) Target Architecture Flow

1. Frontend triggers pipeline run.
2. Backend detects failure log.
3. Backend calls Lambda endpoint (or API Gateway URL).
4. Lambda sends prompt to Amazon Bedrock Nova Lite.
5. Bedrock returns root-cause analysis + remediation steps.
6. Lambda returns structured JSON to backend.
7. Backend stores that analysis in incident response.

## 2) What Already Exists

Your Terraform already supports Bedrock IAM role creation with:
- enable_bedrock flag
- enable_lambda flag
- bedrock_runtime_role_arn output

What is missing right now:
- Lambda function resource
- API Gateway (optional but recommended)
- Backend call from server.js to Lambda/API

## 3) Prerequisites

Run once:

```bash
aws configure
aws sts get-caller-identity
```

Enable Bedrock model access in AWS console (region us-east-1):
- Amazon Bedrock -> Model access -> request access for `amazon.nova-lite-v1:0` or another Nova model

## 4) Lambda Function Code (Node.js 20)

Create a Lambda function that accepts incident log text and returns JSON.

Example handler:

```js
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

export const handler = async (event) => {
  const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || event || {});
  const logText = body.logText || "";

  const prompt = `You are a DevOps RCA assistant. Analyze this CI/CD failure log and return strict JSON with keys: category, severity, failedStage, explanation, remediation (array of exactly 3). Log: ${logText}`;

  const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [{ role: "user", content: [{ text: prompt }] }],
      system: [{ text: "You are a precise DevOps RCA assistant. Return strict JSON only." }],
      inferenceConfig: { maxNewTokens: 400, temperature: 0.2, topP: 0.9 }
    })
  });

  const response = await client.send(command);
  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const text = raw?.content?.[0]?.text || "{}";

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: text
  };
};
```

## 5) Create Lambda Role and Function (CLI Path)

If you want fastest setup before full Terraform extension.

### 5.1 Trust policy file

Create trust-policy.json:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 5.2 Create role and attach policies

```bash
aws iam create-role --role-name cppe-bedrock-lambda-role --assume-role-policy-document file://trust-policy.json
aws iam attach-role-policy --role-name cppe-bedrock-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

Create bedrock-policy.json:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
  ]
}
```

```bash
aws iam put-role-policy --role-name moraai-bedrock-lambda-role --policy-name moraai-bedrock-inline --policy-document file://bedrock-policy.json
```

### 5.3 Zip and create Lambda

```bash
zip -r function.zip index.mjs package.json node_modules
aws lambda create-function \
  --function-name moraai-bedrock-rca \
  --runtime nodejs20.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::<ACCOUNT_ID>:role/moraai-bedrock-lambda-role \
  --environment Variables={BEDROCK_MODEL_ID=amazon.nova-lite-v1:0,AWS_REGION=us-east-1}
```

## 6) Add API Gateway Trigger (Recommended)

Create HTTP API and integrate Lambda:

```bash
aws apigatewayv2 create-api --name moraai-rca-api --protocol-type HTTP
aws apigatewayv2 create-integration --api-id <API_ID> --integration-type AWS_PROXY --integration-uri arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:moraai-bedrock-rca --payload-format-version 2.0
aws apigatewayv2 create-route --api-id <API_ID> --route-key "POST /analyze" --target integrations/<INTEGRATION_ID>
aws apigatewayv2 create-stage --api-id <API_ID> --stage-name prod --auto-deploy
aws lambda add-permission --function-name moraai-bedrock-rca --statement-id apigw-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-1:<ACCOUNT_ID>:<API_ID>/*/*/analyze"
```

Invoke URL becomes:
- https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/analyze

## 7) Backend Integration in server.js

In failure flow, replace static classifyFailure() with API call:

1. Install HTTP client:

```bash
npm install axios
```

2. Add environment variable:

```bash
export RCA_API_URL="https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/analyze"
```

3. In failure path, send payload:

```js
const response = await axios.post(process.env.RCA_API_URL, { logText: failureLog, pipelineId: pipeline.id });
const analysis = response.data;
```

4. Keep fallback to local classifyFailure() if Lambda/API is unavailable.

## 8) Where AWS Account ID Is Needed

You need account ID for:
- Lambda role ARN in create-function command
- API Gateway Lambda permission source ARN
- ECR image URI (if using EKS path)

Get it anytime:

```bash
aws sts get-caller-identity --query Account --output text
```

## 9) Suggested Rollout Sequence

1. Keep local classifier as fallback.
2. Build and deploy Lambda.
3. Test Lambda directly with aws lambda invoke.
4. Add API Gateway route.
5. Switch backend from local classifier to Lambda call.
6. Observe metrics and latency in CloudWatch.
7. Move Lambda and API resources into Terraform after validation.
