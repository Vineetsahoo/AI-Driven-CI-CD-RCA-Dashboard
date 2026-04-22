<#
.SYNOPSIS
Orchestrates the local CI/CD pipeline and stack natively on Windows (no WSL needed).

.DESCRIPTION
This script acts as a local replacement for the GitHub Actions pipeline. It:
1. Validates Node.js and Docker are installed.
2. Builds the frontend and checks backend syntax.
3. Stands up the full local monitoring, AI, and SonarQube stack using Docker Desktop.
4. Performs integration health checks against the running containers.
5. Runs SonarQube analysis against the local code using a Dockerized scanner.
#>

param(
    [switch]$SkipOllama,
    [switch]$SkipSonar,
    [switch]$HostFrontendBuild
)

$ErrorActionPreference = "Stop"
$hasFailures = $false

if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $true
}

function Write-Step ($message) {
    Write-Host "`n=================================================" -ForegroundColor Cyan
    Write-Host " $message" -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Cyan
}

function Write-Pass ($message) {
    Write-Host "[PASS] $message" -ForegroundColor Green
}

function Write-Fail ($message) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
}

# 1. Pre-flight Checks
Write-Step "1. Pre-flight Checks"
try {
    $nodeVer = node --version
    Write-Pass "Node.js found: $nodeVer"
    
    $dockerVer = docker --version
    Write-Pass "Docker found: $dockerVer"
} catch {
    Write-Fail "Missing required tools. Please install Node.js and Docker Desktop."
    exit 1
}

# 2. Local Build and Syntax Check
Write-Step "2. Building & Checking Code"
Write-Host "Installing backend dependencies..."
npm ci | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend dependency installation failed."
    exit 1
}
Write-Pass "Backend dependencies installed."

Write-Host "Checking backend syntax..."
node --check server.js
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend syntax check failed."
    exit 1
}
Write-Pass "Backend syntax ok."

if ($HostFrontendBuild) {
    Write-Host "Installing frontend dependencies & building on host..."
    npm --prefix frontend ci | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Frontend dependency installation failed."
        exit 1
    }
    npm --prefix frontend run build | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Frontend build failed."
        exit 1
    }
    Write-Pass "Frontend build completed successfully."
} else {
    Write-Host "Skipping host frontend build (use -HostFrontendBuild to enable)." -ForegroundColor Yellow
    Write-Host "Frontend is still validated during Docker app image build in step 3."
}

# 3. Bring Up Full Local Infrastructure (App, Ollama, Monitoring, SonarQube)
Write-Step "3. Starting Local Docker Stack (Ollama + Monitoring + SonarQube)"

# We compose both files and optionally use the local-llm profile to load Ollama.
$composeArgs = @("compose", "-f", "docker-compose.yml", "-f", "docker-compose.sonarqube.yml")

if (-not $SkipOllama) {
    Write-Host "Ollama profile enabled (local-llm)."
    $composeArgs += @("--profile", "local-llm")
} else {
    Write-Host "Skipping Ollama startup for this run (-SkipOllama)." -ForegroundColor Yellow
}

$composeArgs += @("up", "-d", "--build")

Write-Host "Starting containers using docker-compose..."
docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker compose startup failed."
    exit 1
}

Write-Host "Waiting for services to initialize (give it ~30 seconds)..."
Start-Sleep -Seconds 30

$containers = docker ps --format "{{.Names}}"
Write-Host "Running containers:"
$containers -split "`n" | ForEach-Object { Write-Host " - $_" }

# 4. API & Integration Smoke Tests
Write-Step "4. Integration Smoke Tests"

$endpoints = @{
    "Backend Root"             = "http://localhost:3000/"
    "Backend Health"           = "http://localhost:3000/health"
    "Grafana Dashboard"        = "http://localhost:3001/login"
    "Prometheus Health"        = "http://localhost:9090/-/healthy"
    "SonarQube Status"         = "http://localhost:9000/api/system/status"
}

foreach ($name in $endpoints.Keys) {
    $url = $endpoints[$name]
    $maxDrops = 5
    $drops = 0
    $success = $false

    while ($drops -lt $maxDrops) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Write-Pass "$name is reachable ($url)."
                $success = $true
                break
            }
        } catch {
            $drops++
            Write-Host "Waiting for $name... Attempt $drops of $maxDrops"
            Start-Sleep -Seconds 5
        }
    }

    if (-not $success) {
        Write-Fail "Failed to reach $name at $url. Check container logs."
        $hasFailures = $true
    }
}

# 5. Local SonarQube Analysis
Write-Step "5. Running Local SonarQube Scanner"

Write-Host "Checking if SonarQube is fully up..."
if ($SkipSonar) {
    Write-Host "Skipping SonarQube scan for this run (-SkipSonar)." -ForegroundColor Yellow
} elseif (-not $env:SONAR_TOKEN) {
    Write-Fail "SONAR_TOKEN is not set. Set it in your shell and rerun to enable SonarQube scan."
    $hasFailures = $true
} else {
try {
    # Default admin credentials usually require a change on first boot, but for a simple scan it may accept it
    # We will use the dockerized sonar-scanner to scan the current directory.
    # Use network host or the sonarqube-network.
    
    Write-Host "Running Sonar Scanner container mapped to local network..."

    $scannerArgs = @(
        "run", "--rm",
        "--network", "mora_ai_sonarqube-network",
        "-e", "SONAR_HOST_URL=http://sonarqube:9000",
        "-e", "SONAR_TOKEN=$($env:SONAR_TOKEN)",
        "-v", "$($PWD.Path):/usr/src",
        "-w", "/usr/src",
        "sonarsource/sonar-scanner-cli:5",
        "-Dsonar.host.url=http://sonarqube:9000",
        "-Dsonar.token=$($env:SONAR_TOKEN)",
        "-Dsonar.projectKey=moraai-ci-cd",
        "-Dsonar.projectName=MoraAI CI/CD Failure Analysis",
        "-Dsonar.sources=.",
        "-Dsonar.exclusions=node_modules/**,frontend/node_modules/**,frontend/dist/**,.git/**,**/*.md,**/*.yml,**/*.yaml,**/*.json,infra/terraform/**,**/*.tf,**/*.tfvars,terraform.tfstate"
    )

    docker @scannerArgs
      
    $LASTEXITCODE = $LASTEXITCODE
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "SonarQube Scan Completed!"
        Write-Host "View your results at http://localhost:9000"
    } else {
        Write-Fail "SonarQube Scan encountered an issue (Exit Code: $LASTEXITCODE)."
        Write-Host "Ensure SONAR_TOKEN is valid for your local SonarQube instance."
        $hasFailures = $true
    }
} catch {
    Write-Fail "Could not execute Sonar Scanner."
    $hasFailures = $true
}
}

Write-Step "Local Pipeline Finished"
Write-Host "To bring down the local environment, run:" -ForegroundColor Yellow
Write-Host "docker compose -f docker-compose.yml -f docker-compose.sonarqube.yml down" -ForegroundColor Yellow

if ($hasFailures) {
    exit 1
}
