# Stock Trend Analyzer

A full-stack serverless application for analyzing stock price trends, detecting buy/sell opportunities, and backtesting trading strategies.

## Features

### Technical Analysis
- **Multiple Technical Indicators**
  - Simple Moving Averages (SMA 20, 50, 200)
  - Exponential Moving Averages (EMA 12, 26)
  - MACD (Moving Average Convergence Divergence)
  - RSI (Relative Strength Index)

### Trading Signals
- **Automated Signal Detection**
  - MACD crossovers (bullish/bearish)
  - Golden Cross & Death Cross (SMA50/SMA200)
  - RSI overbought/oversold conditions
  - Price crossing moving averages
  - Confidence scoring for each signal

### Backtesting Engine
- **Comprehensive Performance Metrics**
  - Total return and percentage gain/loss
  - Win rate calculation
  - Profit factor
  - Sharpe ratio
  - Maximum drawdown
  - Trade-by-trade history
  - Average win/loss analysis

### Interactive Visualizations
- Price charts with technical indicators
- Buy/sell signal markers
- RSI and MACD indicator charts
- Detailed backtesting results
- Trade performance tables

## Architecture

### Backend (Java + AWS Lambda)
- **Serverless Design**: AWS Lambda functions for scalable, cost-effective compute
- **API Gateway**: RESTful API endpoints
- **Java 17**: Modern Java features with Lombok for clean code
- **Financial Modeling Prep API**: Real-time and historical stock data

### Frontend (React + Vite)
- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and dev server
- **Recharts**: Beautiful, responsive charts
- **Tailwind CSS**: Utility-first styling
- **Lucide Icons**: Clean, modern icons

## Project Structure

```
stock-trend-analyzer/
├── backend/                          # Java serverless backend
│   ├── src/main/java/com/stockanalyzer/
│   │   ├── handler/                  # Lambda function handlers
│   │   │   ├── AnalyzeStockHandler.java
│   │   │   └── BacktestHandler.java
│   │   ├── model/                    # Data models
│   │   │   ├── StockPrice.java
│   │   │   ├── TechnicalIndicators.java
│   │   │   ├── Signal.java
│   │   │   ├── Trade.java
│   │   │   ├── BacktestResult.java
│   │   │   └── AnalysisResponse.java
│   │   └── service/                  # Business logic
│   │       ├── FinancialModelingPrepClient.java
│   │       ├── TechnicalAnalysisService.java
│   │       ├── SignalDetectionService.java
│   │       └── BacktestingService.java
│   └── pom.xml                       # Maven configuration
├── frontend/                         # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── StockAnalyzer.jsx     # Main analysis component
│   │   │   ├── BacktestResults.jsx   # Backtesting component
│   │   │   ├── PriceChart.jsx        # Price chart visualization
│   │   │   ├── IndicatorsChart.jsx   # Technical indicators chart
│   │   │   └── SignalsList.jsx       # Trading signals list
│   │   ├── App.jsx                   # Main app component
│   │   ├── main.jsx                  # Entry point
│   │   └── index.css                 # Global styles
│   ├── package.json
│   └── vite.config.js
├── template.yaml                     # AWS SAM template
├── samconfig.toml                    # SAM CLI configuration
└── deploy.sh                         # Deployment script
```

## Prerequisites

### Required Tools
- **Java 17+**: [Download](https://adoptium.net/)
- **Maven 3.8+**: [Download](https://maven.apache.org/download.cgi)
- **Node.js 18+**: [Download](https://nodejs.org/)
- **AWS CLI**: [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **AWS SAM CLI**: [Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

### API Keys
- **Financial Modeling Prep API Key**: [Get Free API Key](https://site.financialmodelingprep.com/developer/docs)
  - Free tier: 250 requests/day
  - Sign up and get your API key from the dashboard

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd stock-trend-analyzer
```

### 2. Backend Setup

#### Build the Backend
```bash
cd backend
mvn clean package
cd ..
```

This will:
- Download all dependencies
- Compile the Java code
- Create a deployable JAR file in `backend/target/`

### 3. Configure AWS

#### Set up AWS Credentials
```bash
aws configure
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Default output format (e.g., `json`)

#### Set Your API Key
```bash
export FMP_API_KEY=your_financial_modeling_prep_api_key
```

### 4. Deploy Backend to AWS

#### Option A: Using the Deployment Script
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Option B: Manual Deployment
```bash
# Build
sam build

# Deploy
sam deploy --guided --parameter-overrides FMPApiKey=$FMP_API_KEY
```

The deployment will create:
- Lambda functions for analyze and backtest endpoints
- API Gateway REST API
- IAM roles and policies
- CloudFormation stack

After deployment, note the **API Gateway URL** from the output.

### 5. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Configure API URL
Create a `.env` file in the `frontend` directory:
```bash
cp .env.example .env
```

Edit `.env` and add your API Gateway URL:
```
VITE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
```

#### Run Development Server
```bash
npm run dev
```

The app will open at `http://localhost:3000`

#### Build for Production
```bash
npm run build
```

The production build will be in `frontend/dist/`

## API Endpoints

### 1. Analyze Stock
**Endpoint**: `GET /analyze`

**Query Parameters**:
- `symbol` (required): Stock ticker symbol (e.g., AAPL, TSLA)
- `days` (optional): Number of days of historical data (default: 365)

**Example**:
```bash
curl "https://your-api-url.amazonaws.com/prod/analyze?symbol=AAPL&days=365"
```

**Response**:
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

### 2. Backtest Strategy
**Endpoint**: `GET /backtest`

**Query Parameters**:
- `symbol` (required): Stock ticker symbol
- `days` (optional): Backtest period in days (default: 365)

**Example**:
```bash
curl "https://your-api-url.amazonaws.com/prod/backtest?symbol=TSLA&days=365"
```

**Response**:
```json
{
  "symbol": "TSLA",
  "backtestResult": {
    "initialCapital": 10000,
    "finalCapital": 12500,
    "totalReturn": 2500,
    "totalReturnPercentage": 25.0,
    "totalTrades": 15,
    "winningTrades": 10,
    "losingTrades": 5,
    "winRate": 66.67,
    "averageWin": 350.0,
    "averageLoss": 150.0,
    "profitFactor": 2.33,
    "sharpeRatio": 1.5,
    "maxDrawdown": 8.5,
    "trades": [...]
  }
}
```

## Usage Guide

### Analyzing a Stock

1. **Open the Application**: Navigate to `http://localhost:3000` (dev) or your deployed URL
2. **Select Technical Analysis Tab**: Click on "Technical Analysis"
3. **Enter Stock Symbol**: Type a ticker symbol (e.g., AAPL, MSFT, TSLA)
4. **Select Time Period**: Choose from 3 months, 6 months, 1 year, or 2 years
5. **Click Analyze**: View the results including:
   - Current trend (Bullish/Bearish/Neutral)
   - Trading recommendation
   - Price chart with technical indicators
   - RSI and MACD charts
   - List of buy/sell signals

### Running a Backtest

1. **Select Backtesting Tab**: Click on "Backtesting"
2. **Enter Stock Symbol**: Type a ticker symbol
3. **Select Backtest Period**: Choose the historical period to test
4. **Click Run Backtest**: View comprehensive results:
   - Total return ($ and %)
   - Win rate percentage
   - Number of trades executed
   - Profit factor and Sharpe ratio
   - Maximum drawdown
   - Trade-by-trade history

## Technical Indicators Explained

### SMA (Simple Moving Average)
- **SMA 20**: 20-day average price - short-term trend
- **SMA 50**: 50-day average price - medium-term trend
- **SMA 200**: 200-day average price - long-term trend

### EMA (Exponential Moving Average)
- **EMA 12**: Fast-moving average for MACD
- **EMA 26**: Slow-moving average for MACD
- Gives more weight to recent prices

### MACD (Moving Average Convergence Divergence)
- **MACD Line**: EMA12 - EMA26
- **Signal Line**: 9-day EMA of MACD
- **Histogram**: MACD - Signal
- Crossovers indicate potential trend changes

### RSI (Relative Strength Index)
- Measures momentum (0-100)
- **> 70**: Overbought (potential sell signal)
- **< 30**: Oversold (potential buy signal)

## Trading Signals

The application detects the following signals:

1. **MACD Crossover**
   - Bullish: MACD crosses above signal line
   - Bearish: MACD crosses below signal line

2. **Golden/Death Cross**
   - Golden Cross: SMA50 crosses above SMA200 (bullish)
   - Death Cross: SMA50 crosses below SMA200 (bearish)

3. **RSI Extremes**
   - Buy signal: RSI drops below 30
   - Sell signal: RSI rises above 70

4. **Price vs SMA20**
   - Buy: Price crosses above SMA20
   - Sell: Price crosses below SMA20

Each signal includes:
- Date
- Signal type (BUY/SELL)
- Price at signal
- Reason for signal
- Confidence score (0-1)

## Deployment to Production

### Frontend Hosting Options

#### Option 1: AWS S3 + CloudFront
```bash
cd frontend
npm run build

# Create S3 bucket
aws s3 mb s3://stocktrendanalyzerfrontend

# Upload build
aws s3 sync dist/ s3://stocktrendanalyzerfrontend --delete

# Configure as website
aws s3 website s3://stocktrendanalyzerfrontend --index-document index.html
```

#### Step-by-step: Deploy frontend on AWS (S3 + CloudFront) with cost notes
1) **Build the site**
   - `cd frontend && npm run build` → outputs to `dist/`.

2) **Create and harden the S3 bucket (CLI or console)**
   - CLI: `aws s3 mb s3://stocktrendanalyzerfrontend`
   - In the AWS console → S3 → your bucket:
     - **Block public access**: keep all four checkboxes enabled (default) so the bucket is private.
     - **Default encryption**: enable SSE-S3 (free) to encrypt objects at rest.
     - **Versioning** (optional): enable if you want rollback for uploaded files.
     - **CORS**: add a simple rule if you need fonts/assets fetched cross-origin (e.g., `[{"AllowedOrigins":["*"],"AllowedMethods":["GET"],"AllowedHeaders":["*"]}]`).
   - Because the bucket is private, you’ll serve it through CloudFront using an Origin Access Control (OAC) so only CloudFront can read the objects.

3) **Upload the build**
   - `aws s3 sync dist/ s3://stocktrendanalyzerfrontend --delete`
   - Add `--cache-control "public, max-age=31536000, immutable"` for hashed assets if desired.

4) **Provision CloudFront**
   - In the AWS Console (or `aws cloudfront create-distribution`):
     - Origin: your S3 bucket.
     - Origin access: enable OAC (modern) or Origin Access Identity (legacy) and attach the generated bucket policy.
       - Example OAC bucket policy stub (replace IDs/ARNs):
         ```json
         {
           "Version": "2012-10-17",
           "Statement": [
             {
               "Effect": "Allow",
               "Principal": {"Service": "cloudfront.amazonaws.com"},
               "Action": "s3:GetObject",
               "Resource": "arn:aws:s3:::stocktrendanalyzerfrontend/*",
               "Condition": {
                 "StringEquals": {
                   "AWS:SourceArn": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id>"
                 }
               }
             }
           ]
         }
         ```
     - Default root object: `index.html`.
     - Viewer protocol policy: Redirect HTTP to HTTPS.
   - After creation, note the CloudFront domain (e.g., `d123.cloudfront.net`).

5) **(Optional) Set up a custom domain + HTTPS**
   - Request a free TLS cert in ACM (us-east-1) for your domain.
   - Attach the cert to the CloudFront distribution.
   - In Route 53 (or your DNS), add a CNAME/ALIAS to the CloudFront domain.

6) **Invalidate cache on updates**
   - After new uploads: `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`.

7) **Open the deployed frontend**
   - In the CloudFront console, wait for the distribution status to show **Enabled** with a completed deployment, then copy the **Domain name** (e.g., `d123.cloudfront.net`).
   - Browse to `https://<your-distribution-domain>` (or your custom domain if configured in Route 53/another DNS provider).
   - If you temporarily exposed the S3 static website endpoint instead of CloudFront, the URL follows the pattern `http://stocktrendanalyzerfrontend.s3-website-<region>.amazonaws.com`, but prefer CloudFront for HTTPS and caching.

##### Rough monthly cost (typical small site)
- **S3 storage/requests**: ~$0.03/GB-month storage, ~$0.005 per 1k PUT, ~$0.0004 per 1k GET (first 12 months often in free tier).
- **CloudFront data out + requests**: e.g., ~$0.085/GB (US) + ~$0.0075 per 10k HTTP requests; prices vary by region/volume and drop with higher usage.
- **ACM certificate**: $0 (public certs are free).
- **Route 53 (optional)**: $0.50 per hosted zone/month + ~$0.40 per million queries.
- **Example**: 5 GB stored, 50k requests, 50 GB data out in US regions ≈ S3 <$1 + CloudFront ~$4.50 + Route 53 ~$0.50 → around ~$6/month (before taxes/credits).

#### Option 2: Netlify
```bash
cd frontend
npm run build

# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

#### Option 3: Vercel
```bash
cd frontend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Frontend hosting comparison

| Platform | Hosting model | CDN/Edge | HTTPS & domains | Deploy flow | When to choose |
| --- | --- | --- | --- | --- | --- |
| **AWS S3 + CloudFront** | Static site in S3, cached and served via CloudFront | Global CDN with fine-grained cache control | Automatic HTTPS via ACM on CloudFront; custom domains and path-based routing supported | `npm run build`, `aws s3 sync dist/ ...`, optional CloudFront cache invalidations | Best when you already use AWS, want tight control over caching, or need to colocate with other AWS services |
| **Netlify** | Static hosting with serverless add-ons | Built-in CDN | Auto HTTPS and custom domains with simple DNS setup | `npm run build`, `netlify deploy --prod --dir=dist` (or connect repo for CI) | Fastest “click-to-deploy” for static sites and preview URLs; good for minimal AWS involvement |
| **Vercel** | Static hosting plus edge functions | Edge network (Vercel Edge Network) | Auto HTTPS and custom domains; per-branch previews | `vercel --prod` (or connect repo for CI) | Great for teams that want instant previews and edge-function support without managing AWS |

### Backend Monitoring

View Lambda logs:
```bash
sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer --tail
```

## Development

### Running Backend Locally

#### Using SAM Local
```bash
# Start local API
sam local start-api --parameter-overrides FMPApiKey=$FMP_API_KEY

# API will be available at http://localhost:3000
```

Update `frontend/.env`:
```
VITE_API_URL=http://localhost:3000
```

### Running Frontend Locally
```bash
cd frontend
npm run dev
```

### Testing Backend
```bash
cd backend
mvn test
```

## Cost Estimation

### AWS Lambda
- **Free Tier**: 1M requests/month, 400,000 GB-seconds compute
- **After Free Tier**: ~$0.20 per 1M requests + compute time
- **Typical Monthly Cost**: < $1 for moderate usage

### API Gateway
- **Free Tier**: 1M API calls/month (12 months)
- **After Free Tier**: $3.50 per million requests
- **Typical Monthly Cost**: < $1

### Financial Modeling Prep API
- **Free Tier**: 250 requests/day
- **Starter Plan**: $14/month for 500 requests/day

**Total Estimated Monthly Cost**: $0-15 (depending on usage)

## Troubleshooting

### Backend Issues

**Problem**: Deployment fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify SAM installation
sam --version

# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name stock-trend-analyzer
```

**Problem**: API returns 500 error
```bash
# Check Lambda logs
sam logs -n AnalyzeStockFunction --stack-name stock-trend-analyzer --tail
```

**Problem**: "FMP API key not configured"
- Ensure you set the parameter during deployment
- Verify in Lambda console: Environment Variables → FMP_API_KEY

### Frontend Issues

**Problem**: Cannot connect to API
- Verify `VITE_API_URL` in `.env` is correct
- Check CORS headers in Lambda responses
- Verify API Gateway is deployed and accessible

**Problem**: Build fails
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## License

This project is licensed under the MIT License.

## Disclaimer

**Important**: This application is for educational and informational purposes only. It is not financial advice. Always do your own research and consult with a qualified financial advisor before making investment decisions. Past performance does not guarantee future results.

## Resources

- [Financial Modeling Prep API Documentation](https://site.financialmodelingprep.com/developer/docs)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [React Documentation](https://react.dev/)
- [Recharts Documentation](https://recharts.org/)
- [Technical Analysis Indicators](https://www.investopedia.com/terms/t/technicalindicator.asp)

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the troubleshooting section above

---

**Built with**: Java 17, AWS Lambda, React 18, Vite, Recharts, Tailwind CSS

**Data Source**: Financial Modeling Prep API
