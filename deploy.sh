#!/bin/bash

# Stock Trend Analyzer Deployment Script

set -e

echo "================================"
echo "Stock Trend Analyzer Deployment"
echo "================================"
echo ""

# Check if FMP API key is set
if [ -z "$FMP_API_KEY" ]; then
    echo "Error: FMP_API_KEY environment variable is not set"
    echo "Please set it with: export FMP_API_KEY=your_api_key"
    exit 1
fi

# Build Backend
echo "Building Java backend..."
cd backend
mvn clean package
cd ..

# Deploy with SAM
echo ""
echo "Deploying to AWS with SAM..."
sam build

# Check if this is first deployment
if [ ! -f samconfig.toml ] || ! grep -q "s3_bucket" samconfig.toml 2>/dev/null; then
    echo ""
    echo "First-time deployment detected. Running guided setup..."
    echo "Please answer the prompts (press Enter for defaults):"
    echo ""
    sam deploy --guided --parameter-overrides FMPApiKey=$FMP_API_KEY
else
    echo ""
    echo "Using existing configuration from samconfig.toml..."
    sam deploy --parameter-overrides FMPApiKey=$FMP_API_KEY
fi

# Get API URL
echo ""
echo "Retrieving API Gateway URL..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name stock-trend-analyzer \
    --query 'Stacks[0].Outputs[?OutputKey==`StockAnalyzerApiUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
    echo "Note: Could not retrieve API URL automatically."
    echo "You can find it in the AWS Console: CloudFormation > stock-trend-analyzer > Outputs"
else
    echo ""
    echo "================================"
    echo "Deployment Successful!"
    echo "================================"
    echo ""
    echo "API URL: $API_URL"
    echo ""
    echo "Next steps:"
    echo "1. Update frontend/.env with: VITE_API_URL=$API_URL"
    echo "2. Deploy frontend: cd frontend && npm run build"
    echo ""
fi
