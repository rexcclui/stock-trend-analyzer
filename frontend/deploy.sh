#!/bin/bash

# Configuration
BUCKET_NAME="stocktrendanalyzerfrontend"
REGION="eu-west-1"

echo "🚀 Deploying Stock Trend Analyzer Frontend to AWS S3..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ Build complete!"

# Upload to S3
echo "☁️  Uploading to S3 bucket: $BUCKET_NAME..."

# Upload all files except index.html with long cache
aws s3 sync dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# Upload index.html with no-cache to ensure updates are immediate
aws s3 cp dist/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache, no-store, must-revalidate"

if [ $? -ne 0 ]; then
  echo "❌ Upload failed!"
  exit 1
fi

echo "✅ Upload complete!"
echo ""
echo "🌐 Your application is available at:"
echo "   http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
echo ""
echo "✨ Deployment successful!"
