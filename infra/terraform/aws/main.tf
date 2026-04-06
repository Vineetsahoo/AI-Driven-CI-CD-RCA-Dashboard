terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

data "aws_caller_identity" "current" {}

locals {
  selected_azs = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  account_id   = data.aws_caller_identity.current.account_id
}

# ──────────────────────────────────────────────────────────────────────
# Networking: VPC, Subnets, Internet Gateway, Route Tables
# ──────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.selected_azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    {
      Name = "${var.project_name}-public-subnet-${count.index + 1}"
    },
    var.enable_eks ? {
      "kubernetes.io/cluster/${var.eks_cluster_name}" = "shared"
      "kubernetes.io/role/elb"                        = "1"
    } : {}
  )
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ──────────────────────────────────────────────────────────────────────
# Security Groups
# ──────────────────────────────────────────────────────────────────────

resource "aws_security_group" "platform" {
  name        = "${var.project_name}-sg"
  description = "Allow app, monitoring and SSH access"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "App"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Prometheus"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Grafana"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Loki"
    from_port   = 3100
    to_port     = 3100
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Ollama"
    from_port   = 11434
    to_port     = 11434
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Log Group
# ──────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "platform" {
  count = var.enable_cloudwatch_log_group ? 1 : 0

  name              = "/cppe/${var.project_name}/application"
  retention_in_days = var.cloudwatch_log_retention_days
}

# ──────────────────────────────────────────────────────────────────────
# EC2 Instance + Instance Profile (Bedrock access from EC2)
# ──────────────────────────────────────────────────────────────────────

resource "aws_iam_instance_profile" "platform" {
  count = var.enable_bedrock ? 1 : 0
  name  = "${var.project_name}-instance-profile"
  role  = aws_iam_role.bedrock_runtime[0].name
}

resource "aws_instance" "platform" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  key_name                    = var.key_name
  vpc_security_group_ids      = [aws_security_group.platform.id]
  associate_public_ip_address = true
  iam_instance_profile        = var.enable_bedrock ? aws_iam_instance_profile.platform[0].name : null

  user_data = <<-EOF
              #!/bin/bash
              dnf update -y
              dnf install -y docker git python3-pip awscli
              systemctl enable docker
              systemctl start docker
              usermod -aG docker ec2-user
              curl -L "https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
              chmod +x /usr/local/bin/docker-compose
              pip3 install ansible

              # Install Ollama
              curl -fsSL https://ollama.com/install.sh | sh
              systemctl enable ollama
              systemctl start ollama

              mkdir -p /opt/${var.project_name}
              chown -R ec2-user:ec2-user /opt/${var.project_name}
              EOF

  tags = {
    Name = "${var.project_name}-host"
  }
}

# ──────────────────────────────────────────────────────────────────────
# ECR Repository
# ──────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "platform" {
  count = var.enable_ecr ? 1 : 0

  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${var.project_name}-ecr"
  }
}

# ──────────────────────────────────────────────────────────────────────
# EKS Cluster & Node Group (optional)
# ──────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "eks_cluster" {
  count = var.enable_eks ? 1 : 0

  name = "${var.project_name}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  count = var.enable_eks ? 1 : 0

  role       = aws_iam_role.eks_cluster[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role" "eks_nodes" {
  count = var.enable_eks ? 1 : 0

  name = "${var.project_name}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  count = var.enable_eks ? 1 : 0

  role       = aws_iam_role.eks_nodes[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  count = var.enable_eks ? 1 : 0

  role       = aws_iam_role.eks_nodes[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_ecr_readonly_policy" {
  count = var.enable_eks ? 1 : 0

  role       = aws_iam_role.eks_nodes[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_eks_cluster" "platform" {
  count = var.enable_eks ? 1 : 0

  name     = var.eks_cluster_name
  role_arn = aws_iam_role.eks_cluster[0].arn

  vpc_config {
    subnet_ids              = [for s in aws_subnet.public : s.id]
    endpoint_public_access  = true
    endpoint_private_access = false
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  depends_on = [aws_iam_role_policy_attachment.eks_cluster_policy]
}

resource "aws_eks_node_group" "platform" {
  count = var.enable_eks ? 1 : 0

  cluster_name    = aws_eks_cluster.platform[0].name
  node_group_name = "${var.project_name}-node-group"
  node_role_arn   = aws_iam_role.eks_nodes[0].arn
  subnet_ids      = [for s in aws_subnet.public : s.id]
  instance_types  = var.eks_node_instance_types

  scaling_config {
    desired_size = var.eks_node_desired_size
    min_size     = var.eks_node_min_size
    max_size     = var.eks_node_max_size
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_ecr_readonly_policy
  ]
}

# ──────────────────────────────────────────────────────────────────────
# Bedrock Runtime IAM Role & Policy
# ──────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "bedrock_runtime" {
  count = var.enable_bedrock ? 1 : 0

  name = "${var.project_name}-bedrock-runtime-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = ["ec2.amazonaws.com", "lambda.amazonaws.com"]
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "bedrock_runtime" {
  count = var.enable_bedrock ? 1 : 0

  name = "${var.project_name}-bedrock-runtime-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels",
          "bedrock:GetFoundationModel"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "bedrock_runtime" {
  count = var.enable_bedrock ? 1 : 0

  role       = aws_iam_role.bedrock_runtime[0].name
  policy_arn = aws_iam_policy.bedrock_runtime[0].arn
}

# ──────────────────────────────────────────────────────────────────────
# Lambda Function for Bedrock RCA (optional)
# ──────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_rca" {
  count = var.enable_lambda ? 1 : 0

  name = "${var.project_name}-lambda-rca-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  count = var.enable_lambda ? 1 : 0

  role       = aws_iam_role.lambda_rca[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_bedrock" {
  count = var.enable_lambda ? 1 : 0

  name = "${var.project_name}-lambda-bedrock-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_bedrock" {
  count = var.enable_lambda ? 1 : 0

  role       = aws_iam_role.lambda_rca[0].name
  policy_arn = aws_iam_policy.lambda_bedrock[0].arn
}

resource "aws_lambda_function" "rca" {
  count = var.enable_lambda ? 1 : 0

  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_rca[0].arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 256

  # The zip file must be built and uploaded before running terraform apply.
  # Run: cd infra/lambda/rca && npm install && zip -r ../../../function.zip .
  filename         = var.lambda_zip_path
  source_code_hash = fileexists(var.lambda_zip_path) ? filebase64sha256(var.lambda_zip_path) : null

  environment {
    variables = {
      BEDROCK_MODEL_ID = var.bedrock_model_id
      AWS_REGION_NAME  = var.aws_region
    }
  }

  tags = {
    Name = "${var.project_name}-rca-lambda"
  }
}

# ──────────────────────────────────────────────────────────────────────
# API Gateway HTTP API for Lambda RCA
# ──────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "rca" {
  count = var.enable_lambda ? 1 : 0

  name          = "${var.project_name}-rca-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "rca" {
  count = var.enable_lambda ? 1 : 0

  api_id                 = aws_apigatewayv2_api.rca[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.rca[0].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "rca" {
  count = var.enable_lambda ? 1 : 0

  api_id    = aws_apigatewayv2_api.rca[0].id
  route_key = "POST /analyze"
  target    = "integrations/${aws_apigatewayv2_integration.rca[0].id}"
}

resource "aws_apigatewayv2_stage" "rca" {
  count = var.enable_lambda ? 1 : 0

  api_id      = aws_apigatewayv2_api.rca[0].id
  name        = "prod"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

resource "aws_lambda_permission" "apigw" {
  count = var.enable_lambda ? 1 : 0

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rca[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.rca[0].execution_arn}/*/*/analyze"
}
