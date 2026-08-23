#!/bin/bash
# Builds studio-vr and deploys it to an S3 static website hosting bucket.
# No CloudFront in front of it yet — this serves straight off the S3
# website endpoint. Add a CloudFront distribution later for HTTPS/CDN
# caching; until then this is the simplest, cheapest way to serve it.
#
# Usage:
#   ./deploy.sh                              # deploys to dualmono-hosting
#   S3_BUCKET=other-bucket ./deploy.sh       # override the target bucket
#
# Optional env vars:
#   S3_BUCKET — the S3 bucket serving the site (default: dualmono-hosting)
#   AWS_PROFILE / AWS_REGION — as usual for the AWS CLI

set -euo pipefail

S3_BUCKET="${S3_BUCKET:-dualmono-hosting}"

cd "$(dirname "$0")"

echo "==> Installing deps"
npm ci

echo "==> Building"
npm run build

echo "==> Syncing hashed, cacheable assets (long cache)"
aws s3 sync dist/ "s3://${S3_BUCKET}" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

echo "==> Syncing index.html (must always revalidate so deploys show up immediately)"
aws s3 cp dist/index.html "s3://${S3_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo "==> Done — site is live at the bucket's static website endpoint"
