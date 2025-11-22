# AWS S3 + CloudFront Deployment Guide

This guide explains how to deploy the Stock Trend Analyzer frontend to AWS S3 with CloudFront CDN.

## Prerequisites

- AWS CLI installed and configured (`aws configure`)
- Node.js and npm installed
- AWS account with appropriate permissions

## Step 1: Build the Frontend

```bash
cd frontend
npm run build
```

This creates a production build in the `dist/` directory.

## Step 2: Create an S3 Bucket

```bash
# Replace 'your-bucket-name' with your desired bucket name
aws s3 mb s3://your-bucket-name --region us-east-1
```

## Step 3: Configure S3 Bucket for Static Website Hosting

```bash
# Enable static website hosting
aws s3 website s3://your-bucket-name \
  --index-document index.html \
  --error-document index.html
```

## Step 4: Create Bucket Policy for Public Access

Create a file `bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

Apply the policy:

```bash
aws s3api put-bucket-policy \
  --bucket your-bucket-name \
  --policy file://bucket-policy.json
```

## Step 5: Upload Build Files to S3

```bash
cd frontend
aws s3 sync dist/ s3://your-bucket-name/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# Upload index.html separately with no-cache
aws s3 cp dist/index.html s3://your-bucket-name/index.html \
  --cache-control "no-cache"
```

## Step 6: Create CloudFront Distribution (Optional but Recommended)

Create a file `cloudfront-config.json`:

```json
{
  "CallerReference": "stock-analyzer-$(date +%s)",
  "Comment": "Stock Trend Analyzer Frontend",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-your-bucket-name",
        "DomainName": "your-bucket-name.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-your-bucket-name",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "Enabled": true
}
```

Create the distribution:

```bash
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json
```

## Alternative: Simpler CloudFront Setup via Console

1. Go to AWS CloudFront Console
2. Click "Create Distribution"
3. **Origin Settings:**
   - Origin Domain: Select your S3 bucket
   - Origin Path: Leave empty
   - Name: Auto-filled
4. **Default Cache Behavior:**
   - Viewer Protocol Policy: Redirect HTTP to HTTPS
   - Allowed HTTP Methods: GET, HEAD
   - Compress Objects: Yes
5. **Distribution Settings:**
   - Default Root Object: `index.html`
6. Click "Create Distribution"

## Step 7: Update Backend CORS (if needed)

If your backend is separate, update CORS settings to allow your CloudFront domain:

```python
# In your backend CORS configuration
ALLOWED_ORIGINS = [
    "https://your-cloudfront-domain.cloudfront.net",
    "http://localhost:5173"  # Keep for local development
]
```

## Deployment Script

Create `deploy.sh` in the frontend directory:

```bash
#!/bin/bash

# Configuration
BUCKET_NAME="your-bucket-name"
DISTRIBUTION_ID="your-cloudfront-distribution-id"  # Optional

# Build
echo "Building frontend..."
npm run build

# Upload to S3
echo "Uploading to S3..."
aws s3 sync dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

aws s3 cp dist/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache"

# Invalidate CloudFront cache (optional)
if [ ! -z "$DISTRIBUTION_ID" ]; then
  echo "Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id $DISTRIBUTION_ID \
    --paths "/*"
fi

echo "Deployment complete!"
```

Make it executable:

```bash
chmod +x deploy.sh
```

## Access Your Application

- **S3 Website URL:** `http://your-bucket-name.s3-website-us-east-1.amazonaws.com`
- **CloudFront URL:** `https://your-distribution-id.cloudfront.net`

## Environment Variables

If you need to configure API endpoints, create a `.env.production` file:

```env
VITE_API_URL=https://your-api-domain.com
```

Rebuild after changing environment variables.

## Troubleshooting

### 404 Errors on Refresh
- Ensure error document is set to `index.html` in S3 website configuration
- For CloudFront, add custom error response for 404 → 200 with `/index.html`

### CORS Issues
- Check backend CORS configuration includes your S3/CloudFront domain
- Verify S3 bucket policy allows public read access

### Cache Issues
- Invalidate CloudFront cache after deployment
- Use versioned filenames for assets (Vite does this automatically)
- Set appropriate cache headers

## Cost Optimization

- Use CloudFront for better performance and lower S3 data transfer costs
- Enable compression in CloudFront
- Set appropriate cache TTLs
- Consider using S3 Intelligent-Tiering for infrequently accessed files
