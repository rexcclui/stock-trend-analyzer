# Stock Trend Analyzer - Complete Setup Guide

This comprehensive guide covers everything you need to deploy and manage the Stock Trend Analyzer application on AWS.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Getting API Keys](#getting-api-keys)
3. [AWS Account Setup](#aws-account-setup)
4. [Option A: Setup Using AWS CloudShell (No Installation)](#option-a-setup-using-aws-cloudshell-no-installation)
5. [Option B: Setup Using AWS CLI (Local Installation)](#option-b-setup-using-aws-cli-local-installation)
6. [Building and Deploying](#building-and-deploying)
7. [Finding Your Deployment in AWS Console](#finding-your-deployment-in-aws-console)
8. [Testing Your Application](#testing-your-application)
9. [Frontend Setup](#frontend-setup)
10. [Monitoring and Debugging](#monitoring-and-debugging)
11. [Updating Your Application](#updating-your-application)
12. [Cost Management](#cost-management)
13. [Cleanup](#cleanup)
14. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Local Machine Requirements

**Required (for building backend):**
- Java 17 or higher
- Maven 3.8+
- Node.js 18+ (for frontend)

**Installation Commands:**

```bash
# macOS
brew install openjdk@17
brew install maven
brew install node

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install openjdk-17-jdk maven nodejs npm

# Verify installations
java -version
mvn -version
node -v
npm -v
```

**For Windows:**
- Java: Download from https://adoptium.net/
- Maven: Download from https://maven.apache.org/download.cgi
- Node.js: Download from https://nodejs.org/

---

## Getting API Keys

### Financial Modeling Prep API Key

1. Visit: https://site.financialmodelingprep.com/developer/docs
2. Click "Sign Up" or "Register"
3. Complete registration (email verification required)
4. Login to your dashboard
5. Find your API key on the main dashboard page
6. Copy and save it securely

**Free Tier Limits:**
- 250 API requests per day
- Historical data access
- Real-time quotes

**Note:** Save your API key - you'll need it during deployment!

---

## AWS Account Setup

### Step 1: Create AWS Account

1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Fill in:
   - Email address
   - Password
   - AWS account name
4. Choose account type: "Personal" or "Professional"
5. Enter payment information (credit/debit card required)
   - **Don't worry**: Free tier covers most usage
   - You won't be charged unless you exceed free tier limits
6. Verify your phone number
7. Select the "Basic Support - Free" plan
8. Complete account activation

### Step 2: Enable MFA (Recommended)

1. Sign in to AWS Console: https://console.aws.amazon.com/
2. Click your account name (top-right) → "Security credentials"
3. Under "Multi-factor authentication (MFA)" → "Assign MFA device"
4. Choose your MFA method:
   - Virtual MFA device (Google Authenticator, Authy)
   - Hardware MFA device
5. Follow setup instructions

---

## Option A: Setup Using AWS CloudShell (No Installation)

**Best for:** First-time setup, no local AWS CLI needed, works entirely in browser

### Step 1: Access AWS CloudShell

1. Sign in to AWS Console: https://console.aws.amazon.com/
2. Click the CloudShell icon **(>_)** in the top navigation bar (next to search)
3. Wait for CloudShell to initialize (takes 10-30 seconds)
4. **You're ready!** CloudShell is automatically authenticated with your AWS account

### Step 2: Upload Your Code to CloudShell

**Method 1: Clone from GitHub (Recommended)**

```bash
# In CloudShell terminal
git clone https://github.com/rexcclui/stock-trend-analyzer.git
cd stock-trend-analyzer
```

**Method 2: Upload Files Manually**

If you have local changes not pushed to GitHub:

1. On your local machine, create a zip file:
   ```bash
   cd stock-trend-analyzer
   zip -r ../stock-analyzer.zip .
   ```

2. In CloudShell:
   - Click **Actions** → **Upload file**
   - Select `stock-analyzer.zip`
   - Wait for upload to complete

3. In CloudShell terminal:
   ```bash
   unzip stock-analyzer.zip
   cd stock-trend-analyzer
   ```

### Step 3: Install SAM CLI in CloudShell

```bash
# Install AWS SAM CLI (one-time setup)
wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install

# Verify installation
sam --version
```

Expected output: `SAM CLI, version 1.x.x`

### Step 4: Build Backend in CloudShell

```bash
# Build Java application
cd backend
mvn clean package

# This creates: target/stock-trend-analyzer-1.0.0.jar
# Go back to project root
cd ..
```

**Note:** Maven is pre-installed in CloudShell, so this should work immediately.

### Step 5: Deploy to AWS

```bash
# Set your Financial Modeling Prep API key
export FMP_API_KEY="your_actual_api_key_here"

# Build SAM application
sam build

# Deploy (first time - guided setup)
sam deploy --guided
```

**Answer the prompts:**

```
Stack Name [sam-app]: stock-trend-analyzer
AWS Region [us-east-1]: us-east-1
Parameter FMPApiKey []: <paste your FMP API key>
Confirm changes before deploy [y/N]: y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
AnalyzeStockFunction has no authentication. Is this okay? [y/N]: y
BacktestFunction has no authentication. Is this okay? [y/N]: y
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

Press Enter to accept defaults where shown.

### Step 6: Get Your API URL

After successful deployment, look for this in the output:

```
CloudFormation outputs from deployed stack
---------------------------------------------------------------------------------
Outputs
---------------------------------------------------------------------------------
Key                 StockAnalyzerApiUrl
Description         API Gateway endpoint URL
Value               https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/
---------------------------------------------------------------------------------
```

**Copy and save this URL** - you'll need it for the frontend!

### Step 7: Test Your API in CloudShell

```bash
# Set your API URL (from Step 6)
API_URL="https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod"

# Test analyze endpoint
curl "${API_URL}/analyze?symbol=AAPL&days=90"

# Test backtest endpoint
curl "${API_URL}/backtest?symbol=TSLA&days=365"
```

You should see JSON responses with stock data!

---

## Option B: Setup Using AWS CLI (Local Installation)

**Best for:** Regular development, working with local files, automated deployments

### Step 1: Install AWS CLI

**macOS:**
```bash
brew install awscli
aws --version
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

**Windows:**
- Download installer: https://awscli.amazonaws.com/AWSCLIV2.msi
- Run installer
- Open new Command Prompt and verify: `aws --version`

### Step 2: Install AWS SAM CLI

**macOS:**
```bash
brew install aws-sam-cli
sam --version
```

**Linux:**
```bash
wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install
sam --version
```

**Windows:**
- Download installer: https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi
- Run installer
- Open new Command Prompt and verify: `sam --version`

### Step 3: Create IAM User with Access Keys

**Via AWS Console:**

1. Sign in to AWS Console: https://console.aws.amazon.com/
2. Search for "IAM" in the top search bar
3. Click **Users** in left sidebar → **Add users**
4. User name: `stock-analyzer-deployer`
5. Click **Next**
6. Select **"Attach policies directly"**
7. Search and select these policies:
   - `AdministratorAccess` (for full access)
   - OR for minimal permissions, select:
     - `AWSLambda_FullAccess`
     - `IAMFullAccess`
     - `AmazonAPIGatewayAdministrator`
     - `AWSCloudFormationFullAccess`
     - `AmazonS3FullAccess`
8. Click **Next** → **Create user**
9. Click on the newly created user
10. Go to **"Security credentials"** tab
11. Scroll down to **"Access keys"** → **"Create access key"**
12. Select use case: **"Command Line Interface (CLI)"**
13. Check the confirmation box → **Next**
14. (Optional) Add description → **Create access key**
15. **IMPORTANT:** Download the CSV file or copy both keys:
    ```
    Access key ID: AKIAIOSFODNN7EXAMPLE
    Secret access key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    ```
16. **⚠️ You cannot view the secret key again after closing this page!**

### Step 4: Configure AWS CLI

```bash
aws configure
```

Enter your credentials:

```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: json
```

**Verify configuration:**

```bash
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDAI...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/stock-analyzer-deployer"
}
```

### Step 5: Deploy Using Local AWS CLI

```bash
# Navigate to your project
cd stock-trend-analyzer

# Set your FMP API key
export FMP_API_KEY="your_actual_api_key_here"

# Build backend
cd backend
mvn clean package
cd ..

# Deploy using the script
chmod +x deploy.sh
./deploy.sh
```

**Or deploy manually:**

```bash
sam build
sam deploy --guided --parameter-overrides FMPApiKey=$FMP_API_KEY
```

---

## Building and Deploying

### First-Time Deployment

```bash
# 1. Set your API key
export FMP_API_KEY="your_fmp_api_key_here"

# 2. Build backend
cd backend
mvn clean package
cd ..

# 3. Run deployment script
./deploy.sh
```

The script will:
- ✅ Build Java backend
- ✅ Run SAM build
- ✅ Detect first deployment and run guided setup
- ✅ Create S3 bucket for Lambda artifacts
- ✅ Deploy to AWS
- ✅ Show your API Gateway URL

### Subsequent Deployments

After the first deployment, it's simpler:

```bash
export FMP_API_KEY="your_api_key"
./deploy.sh
```

Or manually:
```bash
sam build
sam deploy --parameter-overrides FMPApiKey=$FMP_API_KEY
```

---

## Finding Your Deployment in AWS Console

### 1. CloudFormation - Main Dashboard

**URL:** https://console.aws.amazon.com/cloudformation/

**What to do:**
1. Find your stack: `stock-trend-analyzer`
2. Click on the stack name
3. View tabs:
   - **Stack info**: Deployment status
   - **Events**: Deployment history
   - **Resources**: All created AWS services
   - **Outputs**: ⭐ **Your API Gateway URL is here!**
   - **Parameters**: Configuration values

**Get your API URL:**
```
CloudFormation > stock-trend-analyzer > Outputs tab
Copy the value of "StockAnalyzerApiUrl"
```

### 2. Lambda Functions - Your Backend Code

**URL:** https://console.aws.amazon.com/lambda/

**What you'll see:**
- `stock-trend-analyzer-AnalyzeStockFunction-xxxxx`
- `stock-trend-analyzer-BacktestFunction-xxxxx`

**What to check:**
- Click function name
- **"Monitor" tab**: View invocations, errors, duration graphs
- **"Configuration" tab**:
  - Environment variables (FMP_API_KEY)
  - Memory, timeout settings
- **"Code" tab**: View deployed code
- **"Test" tab**: Create test events

### 3. API Gateway - Your REST API

**URL:** https://console.aws.amazon.com/apigateway/

**What to do:**
1. Click on `stock-trend-analyzer` API
2. View sections:
   - **Resources**: See `/analyze` and `/backtest` endpoints
   - **Stages**: Click `prod` to see invoke URL
   - **Dashboard**: API usage statistics

**Test an endpoint:**
1. Go to **Resources**
2. Click `/analyze` → `GET`
3. Click **"Test"** button
4. Add Query Strings: `symbol=AAPL&days=90`
5. Click **"Test"** to see response

### 4. CloudWatch Logs - View Errors & Debug

**URL:** https://console.aws.amazon.com/cloudwatch/

**Navigation:**
1. Click **"Logs"** → **"Log groups"** (left sidebar)
2. Find your log groups:
   - `/aws/lambda/stock-trend-analyzer-AnalyzeStockFunction-xxxxx`
   - `/aws/lambda/stock-trend-analyzer-BacktestFunction-xxxxx`
3. Click a log group → Click latest log stream
4. View real-time logs

**Pro tip:** Sort log groups by "Last Event Time" to see most recent activity

### 5. S3 Bucket - Deployment Artifacts

**URL:** https://s3.console.aws.amazon.com/s3/

**What to look for:**
- Bucket name like: `aws-sam-cli-managed-default-samclisourcebucket-xxxxx`
- Contains your compiled JAR file and SAM artifacts

### 6. IAM Roles - Security Permissions

**URL:** https://console.aws.amazon.com/iam/

**What to check:**
1. Click **"Roles"** (left sidebar)
2. Find roles:
   - `stock-trend-analyzer-AnalyzeStockFunctionRole-xxxxx`
   - `stock-trend-analyzer-BacktestFunctionRole-xxxxx`
3. These give Lambda permission to write logs

### Quick Navigation Summary

| Service | What You'll Find | URL |
|---------|------------------|-----|
| **CloudFormation** | Overall deployment, API URL | https://console.aws.amazon.com/cloudformation/ |
| **Lambda** | Backend functions, logs | https://console.aws.amazon.com/lambda/ |
| **API Gateway** | REST endpoints, testing | https://console.aws.amazon.com/apigateway/ |
| **CloudWatch** | Detailed logs, metrics | https://console.aws.amazon.com/cloudwatch/ |
| **S3** | Deployment artifacts | https://s3.console.aws.amazon.com/s3/ |

---

## Testing Your Application

### Test Backend API

**Using cURL:**

```bash
# Set your API URL (from CloudFormation Outputs)
API_URL="https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod"

# Test analyze endpoint
curl "${API_URL}/analyze?symbol=AAPL&days=90"

# Test backtest endpoint
curl "${API_URL}/backtest?symbol=MSFT&days=365"

# Test with different stocks
curl "${API_URL}/analyze?symbol=TSLA&days=180"
curl "${API_URL}/backtest?symbol=GOOGL&days=730"
```

**Using Browser:**

Open your browser and paste:
```
https://your-api-url.amazonaws.com/prod/analyze?symbol=AAPL&days=90
```

**Using AWS Console API Gateway Test:**

1. Go to API Gateway console
2. Click your API → Resources
3. Click `/analyze` → `GET` → **Test**
4. Add Query Strings:
   - `symbol`: `AAPL`
   - `days`: `90`
5. Click **Test** button

**Expected Response:**

```json
{
  "symbol": "AAPL",
  "prices": [...],
  "indicators": [...],
  "signals": [...],
  "trend": "BULLISH",
  "recommendation": "BUY - Bullish indicators present"
}
```

---

## Frontend Setup

### Step 1: Install Dependencies

```bash
cd frontend
npm install
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

Add your API URL to `.env`:
```
VITE_API_URL=https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
```

### Step 3: Run Development Server

```bash
npm run dev
```

The application will open at http://localhost:3000

### Step 4: Build for Production

```bash
npm run build
```

Production files will be in `frontend/dist/`

---

## Deploying Frontend to Production

### Option A: AWS Amplify (Easiest - Recommended)

**No CLI needed, all in browser!**

1. **Push your code to GitHub** (if not already)

2. Go to AWS Amplify Console: https://console.aws.amazon.com/amplify/

3. Click **"New app"** → **"Host web app"**

4. Select **GitHub** → Authorize AWS Amplify

5. Select repository: `stock-trend-analyzer`
   - Branch: `main` or your preferred branch

6. Configure build settings:
   - Click **"Edit"** on build settings
   - Replace with:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
```

7. **Add environment variable:**
   - Click **"Advanced settings"**
   - Add variable:
     - Key: `VITE_API_URL`
     - Value: `https://your-api-gateway-url.amazonaws.com/prod`

8. Click **"Save and deploy"**

9. Wait 3-5 minutes for deployment

10. Your app will be live at: `https://xxxxx.amplifyapp.com`

**To update:**
- Just push to GitHub - auto-deploys!

### Option B: AWS S3 Static Website

**Using AWS Console (No CLI):**

1. **Build locally:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Create S3 Bucket:**
   - Go to: https://s3.console.aws.amazon.com/s3/
   - Click **"Create bucket"**
   - Bucket name: `stock-analyzer-yourname-12345` (must be unique)
   - Region: Same as your Lambda (e.g., us-east-1)
   - **Uncheck** "Block all public access"
   - Check acknowledgment box
   - Click **"Create bucket"**

3. **Upload files:**
   - Click on bucket name
   - Click **"Upload"**
   - Drag all files from `frontend/dist/` folder
   - Click **"Upload"**

4. **Enable static website hosting:**
   - Go to bucket → **Properties** tab
   - Scroll to **"Static website hosting"**
   - Click **"Edit"**
   - Select **"Enable"**
   - Index document: `index.html`
   - Error document: `index.html`
   - Click **"Save changes"**
   - Note the **Bucket website endpoint**

5. **Set bucket policy:**
   - Go to **Permissions** tab
   - Scroll to **"Bucket policy"**
   - Click **"Edit"**
   - Paste (replace `YOUR-BUCKET-NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

6. Click **"Save changes"**

7. Your app is live at the bucket website endpoint!

### Option C: Netlify

```bash
cd frontend

# Build
npm run build

# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

Follow prompts to create/select site.

### Option D: Vercel

```bash
cd frontend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Follow prompts to deploy.

---

## Monitoring and Debugging

### View Lambda Metrics

1. Go to Lambda console
2. Click your function
3. **"Monitor" tab**:
   - Invocations (total requests)
   - Duration (execution time)
   - Errors
   - Throttles
   - Success rate %

### View Detailed Logs

**Via CloudShell or AWS CLI:**
```bash
# Tail logs in real-time
sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer --tail

# View specific time range
sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer \
  --start-time '2025-01-01T00:00:00' \
  --end-time '2025-01-02T00:00:00'
```

**Via AWS Console:**
1. Lambda → Your function → **Monitor** → **View CloudWatch logs**
2. Or: CloudWatch → Log groups → Your function's log group

### Set Up Alarms

1. Go to CloudWatch console
2. Click **"Alarms"** → **"Create alarm"**
3. Click **"Select metric"**
4. Choose **Lambda** → Find your function
5. Select metric (e.g., Errors, Duration)
6. Set threshold (e.g., Errors > 5)
7. Add notification (email, SMS)
8. Create alarm

### Check API Gateway Logs

1. API Gateway console
2. Your API → **Stages** → `prod`
3. **Logs/Tracing** tab
4. Enable **CloudWatch Logs**
5. Save changes

---

## Updating Your Application

### Update Backend Code

```bash
# 1. Make your changes to Java code
# 2. Build
cd backend
mvn clean package
cd ..

# 3. Deploy
sam build
sam deploy --parameter-overrides FMPApiKey=$FMP_API_KEY

# Or use script
./deploy.sh
```

### Update Frontend Code

**If using Amplify:**
```bash
# Just push to GitHub - auto-deploys!
git add .
git commit -m "Update frontend"
git push
```

**If using S3:**
```bash
# Build
cd frontend
npm run build

# Upload via console or CLI
aws s3 sync dist/ s3://your-bucket-name --delete
```

**If using Netlify/Vercel:**
```bash
# Build
npm run build

# Deploy
netlify deploy --prod --dir=dist
# or
vercel --prod
```

---

## Cost Management

### Monitor Costs

**Billing Dashboard:**
- https://console.aws.amazon.com/billing/

**What to check:**
1. Click **"Bills"** - see current month charges
2. Click **"Cost Explorer"** - detailed breakdown
3. Click **"Free Tier"** - track free tier usage

### Set Up Budget Alerts

1. Go to Billing console
2. Click **"Budgets"** → **"Create budget"**
3. Select **"Cost budget"**
4. Set amount: $10/month (recommended)
5. Add email for alerts
6. Create budget

### Expected Monthly Costs

**Free Tier (First 12 months):**
- Lambda: 1M requests/month free
- API Gateway: 1M calls/month free
- CloudWatch: 10 custom metrics free

**After Free Tier:**
- Lambda: ~$0.20 per 1M requests
- API Gateway: $3.50 per 1M requests
- S3: $0.023 per GB/month
- CloudWatch Logs: $0.50 per GB ingested

**Financial Modeling Prep API:**
- Free: 250 requests/day
- Paid: $14/month for 500 requests/day

**Typical Monthly Cost:** $0-15 (light usage)

---

## Cleanup

### Delete Everything (To Avoid Charges)

**Via CloudShell or AWS CLI:**
```bash
# Delete CloudFormation stack (removes all resources)
sam delete --stack-name stock-trend-analyzer

# Or using AWS CLI
aws cloudformation delete-stack --stack-name stock-trend-analyzer

# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name stock-trend-analyzer
```

**Via AWS Console:**
1. Go to CloudFormation console
2. Select `stock-trend-analyzer` stack
3. Click **"Delete"**
4. Confirm deletion
5. Wait 5-10 minutes for completion

**Delete S3 Bucket (if created):**

Via Console:
1. Go to S3 console
2. Select bucket
3. Click **"Empty"** → Confirm
4. Click **"Delete"** → Type bucket name → Confirm

Via CLI:
```bash
# Empty bucket first
aws s3 rm s3://your-bucket-name --recursive

# Delete bucket
aws s3 rb s3://your-bucket-name
```

**Delete Amplify App (if created):**
1. Go to Amplify console
2. Select app
3. **Actions** → **Delete app**

---

## Troubleshooting

### Deployment Issues

**Problem: "S3 Bucket not specified" error**

Solution:
```bash
# Use the updated deploy script with auto S3 resolution
./deploy.sh

# Or manually add --resolve-s3 flag
sam deploy --guided --resolve-s3 --parameter-overrides FMPApiKey=$FMP_API_KEY
```

**Problem: "Access Denied" during deployment**

Solutions:
1. Check AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Verify IAM permissions - user needs:
   - CloudFormation
   - Lambda
   - API Gateway
   - S3
   - IAM role creation

3. If using CloudShell, it's auto-authenticated - no config needed

**Problem: Maven build fails**

Solutions:
```bash
# Clean Maven cache
cd backend
mvn clean

# Try again with verbose output
mvn clean package -X

# Check Java version (must be 17+)
java -version
```

### Runtime Issues

**Problem: API returns 500 Internal Server Error**

Solutions:
1. Check Lambda logs:
   ```bash
   sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer --tail
   ```

2. Common causes:
   - Missing FMP_API_KEY
   - Invalid stock symbol
   - FMP API rate limit exceeded

3. Verify environment variable:
   - Lambda console → Function → Configuration → Environment variables
   - Should see: `FMP_API_KEY = xxx`

**Problem: "FMP API key not configured"**

Solutions:
1. Re-deploy with API key:
   ```bash
   export FMP_API_KEY="your_key"
   sam deploy --parameter-overrides FMPApiKey=$FMP_API_KEY
   ```

2. Or update in console:
   - Lambda → Function → Configuration → Environment variables
   - Edit FMP_API_KEY value

**Problem: API returns 403 Forbidden**

Solutions:
1. Check API Gateway is deployed to `prod` stage
2. Verify endpoint URL is correct
3. Check CORS headers (already configured in code)

### Frontend Issues

**Problem: Cannot connect to API (CORS error)**

Solutions:
1. Verify API URL in `.env`:
   ```bash
   cat frontend/.env
   ```

2. Should be: `VITE_API_URL=https://your-api-url.amazonaws.com/prod`

3. Restart dev server after changing `.env`:
   ```bash
   npm run dev
   ```

4. Check browser console for actual error

**Problem: Build fails with "Cannot find module"**

Solutions:
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Try build again
npm run build
```

**Problem: Blank page after deployment**

Solutions:
1. Check browser console for errors
2. Verify API URL is correct in production build
3. Check S3 bucket has index.html
4. Verify bucket policy allows public access

### AWS CloudShell Issues

**Problem: CloudShell session timeout**

Solution:
- CloudShell sessions timeout after 20 minutes of inactivity
- Just refresh the page to start a new session
- Your files persist (stored in home directory)

**Problem: "No space left on device" in CloudShell**

Solution:
```bash
# Check disk usage
df -h

# Clean up old files
rm -rf sam-installation/
rm *.zip

# CloudShell has 1GB persistent storage
```

### Common Error Messages

**Error: "CREATE_FAILED: AnalyzeStockFunction (AWS::Lambda::Function)"**

Cause: Lambda creation failed

Solution:
1. Check CloudFormation Events tab for details
2. Common causes:
   - Code package too large (>50MB)
   - Invalid handler name
   - Permission issues

**Error: "Rate exceeded" from Financial Modeling Prep**

Cause: Exceeded free tier (250 requests/day)

Solutions:
1. Wait 24 hours for reset
2. Upgrade FMP plan
3. Reduce testing frequency

**Error: "Timeout" when calling API**

Cause: Lambda execution timeout (default 30s)

Solution:
1. Check if FMP API is responding slowly
2. Increase Lambda timeout:
   - Lambda console → Configuration → General → Edit
   - Increase timeout to 60 seconds

---

## Security Best Practices

### Protect Your Credentials

✅ **Do:**
- Store access keys in password manager
- Use IAM users (not root account)
- Enable MFA on AWS account
- Rotate access keys regularly
- Use environment variables for API keys
- Delete unused access keys

❌ **Don't:**
- Commit credentials to Git
- Share access keys
- Use root account for daily tasks
- Email credentials
- Hardcode API keys in code

### IAM Best Practices

1. **Principle of Least Privilege:**
   - Only grant permissions needed
   - Use specific policies vs. AdministratorAccess when possible

2. **Use IAM Roles for Lambda:**
   - Lambda should use roles, not access keys
   - SAM creates these automatically

3. **Enable CloudTrail:**
   - Tracks all AWS API calls
   - Helps with security auditing

### API Security

**Current setup:**
- Public API (no authentication)
- Fine for demo/learning
- Rate limited by API Gateway

**For production, add:**
1. API keys
2. AWS Cognito authentication
3. AWS WAF for DDoS protection
4. API Gateway usage plans

---

## Additional Resources

### AWS Documentation
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)

### Financial Modeling Prep
- [API Documentation](https://site.financialmodelingprep.com/developer/docs)
- [Pricing Plans](https://site.financialmodelingprep.com/developer/docs/pricing)

### Frontend Resources
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Recharts Documentation](https://recharts.org/)
- [Tailwind CSS](https://tailwindcss.com/)

### Technical Analysis
- [Investopedia - Technical Analysis](https://www.investopedia.com/terms/t/technicalanalysis.asp)
- [MACD Indicator Explained](https://www.investopedia.com/terms/m/macd.asp)
- [RSI Indicator Explained](https://www.investopedia.com/terms/r/rsi.asp)

---

## Support

**For AWS Issues:**
- AWS Support: https://console.aws.amazon.com/support/
- AWS Forums: https://forums.aws.amazon.com/
- Stack Overflow: Tag with `aws-lambda`, `aws-sam-cli`

**For Application Issues:**
- GitHub Issues: https://github.com/rexcclui/stock-trend-analyzer/issues
- Check existing issues first
- Provide logs when reporting bugs

**For API Questions:**
- FMP Support: support@financialmodelingprep.com
- FMP Documentation: https://site.financialmodelingprep.com/developer/docs

---

## Quick Reference Commands

### Deployment
```bash
# First time
export FMP_API_KEY="your_key"
./deploy.sh

# Updates
sam build && sam deploy --parameter-overrides FMPApiKey=$FMP_API_KEY
```

### Testing
```bash
# Test API
curl "https://your-api-url/prod/analyze?symbol=AAPL&days=90"

# View logs
sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer --tail
```

### Frontend
```bash
# Development
cd frontend && npm run dev

# Build
npm run build

# Deploy to S3
aws s3 sync dist/ s3://your-bucket --delete
```

### Cleanup
```bash
# Delete stack
sam delete --stack-name stock-trend-analyzer

# Delete S3
aws s3 rb s3://your-bucket --force
```

---

**Document Version:** 1.0
**Last Updated:** 2025-01-16
**Author:** Stock Trend Analyzer Team

For the latest version of this guide, visit: https://github.com/rexcclui/stock-trend-analyzer
