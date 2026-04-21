pipeline {
  agent any
  environment {
    NODE_VERSION = '20'
    SONAR_HOST_URL = 'http://localhost:9000'
    APP_PORT = '3000'
    BEDROCK_MODEL_ID = "${env.BEDROCK_MODEL_ID ?: 'amazon.nova-lite-v1:0'}"
    BEDROCK_RUNTIME_ROLE_ARN = "${env.BEDROCK_RUNTIME_ROLE_ARN ?: ''}"
    RCA_API_URL = "${env.RCA_API_URL ?: ''}"
    OLLAMA_URL = "${env.OLLAMA_URL ?: 'http://127.0.0.1:11434'}"
    OLLAMA_MODEL = "${env.OLLAMA_MODEL ?: 'llama3.2'}"
    OLLAMA_ENABLED = "${env.OLLAMA_ENABLED ?: 'true'}"
  }
  options {
    ansiColor('xterm')
    timeout(time: 90, unit: 'MINUTES')
    timestamps()
  }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Install dependencies') {
      steps {
        sh 'npm ci && npm --prefix frontend ci'
      }
    }
    stage('Backend syntax check') {
      steps {
        sh 'node --check server.js'
      }
    }
    stage('Frontend build') {
      steps {
        sh 'npm --prefix frontend run build'
      }
    }
    stage('Docker build') {
      steps {
        script {
          sh 'docker build -t moraai:jenkins-${BUILD_NUMBER} .'
        }
      }
    }
    stage('Start backend') {
      steps {
        script {
          sh '''
            nohup node server.js > /tmp/moraai-backend.log 2>&1 &
            echo $! > /tmp/moraai-backend.pid
          '''
        }
      }
    }
    stage('Backend health and API integration') {
      steps {
        script {
          sh '''
            retries=0
            until curl -fsS http://127.0.0.1:${APP_PORT}/health || [ $retries -ge 15 ]; do
              retries=$((retries+1))
              sleep 2
            done
            if [ $retries -ge 15 ]; then
              cat /tmp/moraai-backend.log
              exit 1
            fi

            curl -f http://127.0.0.1:${APP_PORT}/
            curl -f http://127.0.0.1:${APP_PORT}/api/saas/dashboard
            curl -f http://127.0.0.1:${APP_PORT}/api/pipelines
            curl -f http://127.0.0.1:${APP_PORT}/api/rca/providers
            curl -f http://127.0.0.1:${APP_PORT}/api/rca/architecture
          '''
        }
      }
    }
    stage('Bedrock RCA integration') {
      steps {
        script {
          sh '''
            curl -f -X POST http://127.0.0.1:${APP_PORT}/api/rca/analyze \
              -H 'Content-Type: application/json' \
              -d '{"logText":"Jenkins pipeline Bedrock RCA integration test.","pipelineId":"P-1001"}'

            curl -f -X POST http://127.0.0.1:${APP_PORT}/api/pipelines/P-1001/run \
              -H 'Content-Type: application/json' \
              -d '{"forceFail":true,"failureLog":"Jenkins integration test failure log."}'
          '''
        }
      }
    }
    stage('SonarQube quality gate') {
      steps {
        script {
          sh '''
            # Install sonar-scanner if not present
            if ! command -v sonar-scanner &> /dev/null; then
              echo "Installing SonarQube scanner..."
              cd /tmp
              wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-6.2.0.4589-linux.zip
              unzip -q sonar-scanner-cli-6.2.0.4589-linux.zip
              export PATH=$PATH:/tmp/sonar-scanner-6.2.0.4589-linux/bin
            fi
            
            # Run SonarQube analysis
            sonar-scanner \
              -Dsonar.login="${SONAR_TOKEN}" \
              -Dsonar.projectKey=moraai-ci-cd \
              -Dsonar.projectName="MoraAI CI/CD Failure Analysis" \
              -Dsonar.host.url="${SONAR_HOST_URL}" \
              -Dsonar.sources=. \
              -Dsonar.exclusions=node_modules/**,frontend/node_modules/**,frontend/dist/**,.git/**,**/*.md,**/*.yml,**/*.yaml,**/*.json
          '''
        }
      }
    }
  }
  post {
    always {
      sh '''
        cat /tmp/moraai-backend.log || true
        if [ -f /tmp/moraai-backend.pid ]; then
          kill "$(cat /tmp/moraai-backend.pid)" || true
        fi
      '''
    }
  }
}
