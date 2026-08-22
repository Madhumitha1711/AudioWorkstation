#!/bin/bash
# Builds studio-vr and deploys it to an S3 static website hosting bucket.
# No CloudFront in front of it yet — this serves straight off the S3
# website endpoint. Add a CloudFront distribution later for HTTPS/CDN
# caching; until then this is the simplest, cheapest way to serve it.
#
# Usage:
#   S3_BUCKET=my-frontend-bucket ./deploy.sh
#
# Required env vars:
#   S3_BUCKET — the S3 bucket serving the site
# Optional:
#   AWS_PROFILE / AWS_REGION — as usual for the AWS CLI

set -euo pipefail

if [[ -z "${S3_BUCKET:-}" ]]; then
  echo "Set S3_BUCKET before running this script." >&2
  exit 1
fi

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
