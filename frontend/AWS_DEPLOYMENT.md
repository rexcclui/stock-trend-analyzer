# AWS S3 Deployment Guide for Stock Trend Analyzer Frontend

This guide provides step-by-step instructions for deploying the frontend to AWS S3 with static website hosting.

## Prerequisites

- AWS CLI installed and configured (`aws configure`)
- AWS account with S3 permissions
- Node.js and npm installed

## Deployment Steps

### 1. Create S3 Bucket

```bash
aws s3 mb s3://stocktrendanalyzerfrontend --region eu-west-1
```

### 2. Enable Static Website Hosting

```bash
aws s3 website s3://stocktrendanalyzerfrontend \
  --index-document index.html \
  --error-document index.html
```

### 3. Disable Block Public Access

This is required to make the bucket publicly accessible for website hosting:

```bash
aws s3api put-public-access-block \
  --bucket stocktrendanalyzerfrontend \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### 4. Apply Bucket Policy for Public Access

From the project root directory:

```bash
aws s3api put-bucket-policy \
  --bucket stocktrendanalyzerfrontend \
  --policy file://bucket-policy.json
```

The `bucket-policy.json` file is already created in the project root with the following content:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::stocktrendanalyzerfrontend/*"
    }
  ]
}
```

### 5. Deploy the Application

```bash
cd frontend
./deploy.sh
```

The deployment script will:
- Build the production bundle with Vite
- Upload all assets to S3 with appropriate cache headers
- Upload `index.html` with no-cache headers for instant updates

## Access Your Application

After deployment, your application will be available at:

**http://stocktrendanalyzerfrontend.s3-website-eu-west-1.amazonaws.com**

## Future Deployments

For subsequent deployments, simply run:

```bash
cd frontend
./deploy.sh
```

The script will rebuild and sync all changes to S3.

## Deployment Script Details

The `deploy.sh` script performs the following:

1. **Build**: Runs `npm run build` to create production bundle in `dist/`
2. **Upload Assets**: Syncs all files except `index.html` with 1-year cache
3. **Upload HTML**: Uploads `index.html` with no-cache headers
4. **Cleanup**: Deletes removed files from S3 with `--delete` flag

## Cache Strategy

- **Static Assets** (JS, CSS, images): `max-age=31536000` (1 year)
  - Vite automatically adds content hashes to filenames
  - Safe to cache indefinitely
  
- **index.html**: `no-cache, no-store, must-revalidate`
  - Always fetches latest version
  - Ensures users get updated asset references

## Troubleshooting

### 404 Errors on Page Refresh

If you get 404 errors when refreshing on routes other than home:
- Verify error document is set to `index.html` in website configuration
- This is already configured in step 2

### Upload Fails with "NoSuchBucket"

- Ensure you created the bucket in the correct region (eu-west-1)
- Verify bucket name matches exactly: `stocktrendanalyzerfrontend`

### Access Denied Errors

- Ensure Block Public Access is disabled (step 3)
- Verify bucket policy is applied (step 4)
- Check your AWS IAM user has S3 permissions

### CORS Issues

If your backend is on a different domain, ensure backend CORS configuration includes:

```python
ALLOWED_ORIGINS = [
    "http://stocktrendanalyzerfrontend.s3-website-eu-west-1.amazonaws.com",
    "http://localhost:5173"  # For local development
]
```

## Optional: CloudFront CDN

For HTTPS and better global performance, consider adding CloudFront:

1. Create CloudFront distribution with S3 origin
2. Point origin to: `stocktrendanalyzerfrontend.s3-website-eu-west-1.amazonaws.com`
3. Set default root object to `index.html`
4. Configure custom error response: 404 → 200 with `/index.html`
5. Update backend CORS to include CloudFront domain

## Cost Optimization

- **S3 Storage**: ~$0.023/GB/month (eu-west-1)
- **Data Transfer**: First 1GB free, then ~$0.09/GB
- **Requests**: ~$0.0004 per 1,000 GET requests

For a typical frontend application:
- Storage: ~5MB = $0.0001/month
- Expected cost: < $1/month for moderate traffic

## Security Notes

- Bucket is publicly readable (required for website hosting)
- No sensitive data should be in the frontend bundle
- API keys should be server-side only
- Consider CloudFront with AWS WAF for production
