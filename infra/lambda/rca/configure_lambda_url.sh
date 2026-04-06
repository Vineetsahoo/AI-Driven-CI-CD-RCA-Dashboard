#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="moraai-bedrock-rca"
REGION="us-east-1"
MODEL_ID="anthropic.claude-3-haiku-20240307-v1:0"

cat > /tmp/lambda-env.json <<EOF
{
  "Variables": {
    "BEDROCK_MODEL_ID": "${MODEL_ID}"
  }
}
EOF

aws lambda update-function-configuration \
  --function-name "${FUNCTION_NAME}" \
  --environment file:///tmp/lambda-env.json \
  --region "${REGION}" >/tmp/lambda_env.json

aws lambda get-function-url-config \
  --function-name "${FUNCTION_NAME}" \
  --region "${REGION}" >/tmp/lambda_url.json 2>/dev/null || aws lambda create-function-url-config \
  --function-name "${FUNCTION_NAME}" \
  --auth-type NONE \
  --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["*"]}' \
  --region "${REGION}" >/tmp/lambda_url.json

aws lambda add-permission \
  --function-name "${FUNCTION_NAME}" \
  --statement-id function-url-public-access \
  --action lambda:InvokeFunctionUrl \
  --principal '*' \
  --function-url-auth-type NONE \
  --region "${REGION}" >/tmp/lambda_perm.json 2>/dev/null || true

aws lambda add-permission \
  --function-name "${FUNCTION_NAME}" \
  --statement-id function-url-invoke-access \
  --action lambda:InvokeFunction \
  --principal '*' \
  --invoked-via-function-url \
  --region "${REGION}" >/tmp/lambda_invoke_perm.json 2>/dev/null || true

cat /tmp/lambda_url.json
