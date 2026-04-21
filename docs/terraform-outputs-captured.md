app_url = "http://44.198.166.96:3000"
bedrock_runtime_role_arn = "arn:aws:iam::818825274841:role/MoraAI-bedrock-runtime-role"
cloudwatch_log_group_name = "/cppe/MoraAI/application"
ecr_repository_url = "818825274841.dkr.ecr.us-east-1.amazonaws.com/moraai"
eks_cluster_endpoint = "https://DD6EC9194D30E30826A730279EE2BEAB.gr7.us-east-1.eks.amazonaws.com"
eks_cluster_name = "moraai-eks"
eks_node_group_name = "MoraAI-node-group"
grafana_url = "http://44.198.166.96:3001"
instance_public_dns = "ec2-44-198-166-96.compute-1.amazonaws.com"
instance_public_ip = "44.198.166.96"
lambda_function_name = "moraai-bedrock-rca"
loki_url = "http://44.198.166.96:3100"
prometheus_url = "http://44.198.166.96:9090"
rca_api_url = "https://n52ix6pw08.execute-api.us-east-1.amazonaws.com/prod/analyze"

# Runtime verification (captured on 2026-04-05)
public_health_status = 200
app_root_status = 200
grafana_status = 200
prometheus_status = 200

# Remediation applied during deployment
ec2_root_volume_before_gib = 8
ec2_root_volume_after_gib = 30
ec2_root_filesystem_after_resize = "30G total, 23G available"

# Kubernetes phase (moraai-eks)
k8s_namespace = "moraai"
k8s_deployment = "moraai-platform"
k8s_service_type = "LoadBalancer"
k8s_service_hostname = "aa43d3d499efc4676822e449372bb3c0-813026566.us-east-1.elb.amazonaws.com"
k8s_service_health_status = 200

# WSL root health-check script
wsl_health_script_path = "~/moraai-health-check.sh"
wsl_health_script_last_run_utc = "2026-04-05 12:54:52 UTC"
wsl_health_script_result = "all checks passed (app, grafana, prometheus, rca_api)"