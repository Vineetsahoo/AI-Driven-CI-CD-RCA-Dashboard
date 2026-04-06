variable "project_name" {
  description = "Project name prefix for AWS resources"
  type        = string
  default     = "MoraAI"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets across AZs"
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "instance_type" {
  description = "EC2 instance type for platform host"
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "Existing AWS key pair name for SSH"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH into EC2"
  type        = string
  default     = "0.0.0.0/0"
}

variable "enable_ecr" {
  description = "Create Amazon ECR repository"
  type        = bool
  default     = true
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository"
  type        = string
  default     = "moraai"
}

variable "enable_eks" {
  description = "Create EKS cluster and managed node group"
  type        = bool
  default     = false
}

variable "eks_cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "moraai-eks"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_size" {
  description = "Desired node count for EKS managed node group"
  type        = number
  default     = 2
}

variable "eks_node_min_size" {
  description = "Minimum node count for EKS managed node group"
  type        = number
  default     = 1
}

variable "eks_node_max_size" {
  description = "Maximum node count for EKS managed node group"
  type        = number
  default     = 3
}

variable "enable_bedrock" {
  description = "Create Bedrock invocation IAM role/policy"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_log_group" {
  description = "Create CloudWatch log group for platform workloads"
  type        = bool
  default     = true
}

variable "cloudwatch_log_retention_days" {
  description = "Retention period for platform CloudWatch logs"
  type        = number
  default     = 14
}

# ──────────────────────────────────────────────────────────────────────
# Lambda + API Gateway variables
# ──────────────────────────────────────────────────────────────────────

variable "enable_lambda" {
  description = "Create Lambda function and API Gateway for Bedrock RCA"
  type        = bool
  default     = true
}

variable "lambda_function_name" {
  description = "Name of the Lambda function for RCA"
  type        = string
  default     = "moraai-bedrock-rca"
}

variable "lambda_zip_path" {
  description = "Path to the Lambda deployment zip file"
  type        = string
  default     = "../../../function.zip"
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for RCA analysis"
  type        = string
  default     = "amazon.nova-lite-v1:0"
}
