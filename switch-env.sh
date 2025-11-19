#!/bin/bash

# Script to switch between local and AWS environments

ENV_FILE="frontend/.env"

case "$1" in
  local)
    echo "Switching to LOCAL environment (SAM Local on http://localhost:3000)"
    cat > "$ENV_FILE" << EOF
# Local Development with SAM Local
VITE_API_URL=http://localhost:3000
EOF
    echo "✓ Frontend now configured for local development"
    echo "  Run: sam local start-api --env-vars env.json"
    echo "  Then: cd frontend && npm run dev"
    ;;

  aws|prod)
    echo "Switching to AWS PRODUCTION environment"
    echo "Enter your API Gateway URL (or press Enter to use placeholder):"
    read -r API_URL

    if [ -z "$API_URL" ]; then
      API_URL="https://your-api-gateway-url.amazonaws.com/prod"
    fi

    cat > "$ENV_FILE" << EOF
# Production AWS Deployment
VITE_API_URL=$API_URL
EOF
    echo "✓ Frontend now configured for AWS production"
    echo "  API URL: $API_URL"
    echo "  Run: cd frontend && npm run dev"
    ;;

  *)
    echo "Usage: $0 {local|aws|prod}"
    echo ""
    echo "Examples:"
    echo "  $0 local    - Switch to local SAM development"
    echo "  $0 aws      - Switch to AWS production"
    echo ""
    exit 1
    ;;
esac
