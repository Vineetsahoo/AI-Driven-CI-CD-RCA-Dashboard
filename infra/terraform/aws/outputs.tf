output "instance_public_ip" {
  description = "Public IP of CPPE platform host"
  value       = aws_instance.platform.public_ip
}

output "instance_public_dns" {
  description = "Public DNS of CPPE platform host"
  value       = aws_instance.platform.public_dns
}

output "app_url" {
  description = "Application URL"
  value       = "http://${aws_instance.platform.public_ip}:3000"
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "http://${aws_instance.platform.public_ip}:9090"
}

output "grafana_url" {
  description = "Grafana URL"
  value       = "http://${aws_instance.platform.public_ip}:3001"
}

output "loki_url" {
  description = "Loki URL"
  value       = "http://${aws_instance.platform.public_ip}:3100"
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = var.enable_ecr ? aws_ecr_repository.platform[0].repository_url : null
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = var.enable_eks ? aws_eks_cluster.platform[0].name : null
}

output "eks_cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = var.enable_eks ? aws_eks_cluster.platform[0].endpoint : null
}

output "eks_node_group_name" {
  description = "EKS managed node group name"
  value       = var.enable_eks ? aws_eks_node_group.platform[0].node_group_name : null
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group for platform workloads"
  value       = var.enable_cloudwatch_log_group ? aws_cloudwatch_log_group.platform[0].name : null
}

output "bedrock_runtime_role_arn" {
  description = "IAM role ARN for Bedrock runtime invocations"
  value       = var.enable_bedrock ? aws_iam_role.bedrock_runtime[0].arn : null
}

output "lambda_function_name" {
  description = "Lambda RCA function name"
  value       = var.enable_lambda ? aws_lambda_function.rca[0].function_name : null
}

output "rca_api_url" {
  description = "API Gateway URL for RCA Lambda (POST /analyze)"
  value       = var.enable_lambda ? "${aws_apigatewayv2_stage.rca[0].invoke_url}/analyze" : null
}
