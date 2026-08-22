#!/bin/bash
# Reads studio-cms/.env (your real local values) and pushes exactly the
# keys studio-cms-task-def.json expects under "secrets" into SSM Parameter
# Store as SecureString, under /studio/dev/*.
#
# Usage: ./push-cms-secrets-to-ssm.sh [path/to/studio-cms/.env]
# Defaults to ../studio-cms/.env (i.e. run from the scripts/ folder).
#
# Safe to re-run — existing parameters are overwritten in place.
#
# Two portability notes baked into how this is written, both because macOS
# ships bash 3.2 as /bin/bash by default (Apple froze it there years ago):
#   1. .env is parsed as plain text (grep/sed), never `source`d — a real
#      secret (an RDS password, a signing key) can contain a "$" or other
#      shell-special character, and sourcing would make bash try to expand
#      that as a variable reference and fail with "unbound variable".
#   2. Key/value pairs below use a plain indexed array ("KEY:SSM_NAME"
#      strings), not `declare -A` — bash 3.2 has no associative arrays, and
#      silently mis-parses that syntax instead of refusing to run.

set -euo pipefail

ENV_FILE="${1:-$(dirname "$0")/../studio-cms/.env}"
PREFIX="/studio/dev"
REGION="ap-south-1"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env file found at $ENV_FILE" >&2
  exit 1
fi

# Extracts the value for KEY=... from an .env file without ever letting the
# shell execute/expand its contents. Takes the last matching line (so a
# later override in the file wins) and strips one layer of surrounding
# quotes if present, leaving escape sequences like \n untouched.
env_value() {
  local key="$1" file="$2" line value
  line=$(grep -E "^${key}=" "$file" | tail -n1 || true)
  if [[ -z "$line" ]]; then
    printf ''
    return
  fi
  value="${line#*=}"
  if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi
  printf '%s' "$value"
}

MAP=(
  "DATABASE_USERNAME:DATABASE_USERNAME"
  "DATABASE_PASSWORD:DATABASE_PASSWORD"
  "APP_KEYS:APP_KEYS"
  "API_TOKEN_SALT:API_TOKEN_SALT"
  "ADMIN_JWT_SECRET:ADMIN_JWT_SECRET"
  "TRANSFER_TOKEN_SALT:TRANSFER_TOKEN_SALT"
  "ENCRYPTION_KEY:ENCRYPTION_KEY"
  "AWS_ACCESS_KEY_ID:CMS_AWS_ACCESS_KEY_ID"
  "AWS_ACCESS_SECRET:CMS_AWS_ACCESS_SECRET"
  "CLOUDFLARE_ACCOUNT_ID:CLOUDFLARE_ACCOUNT_ID"
  "CLOUDFLARE_STREAM_API_TOKEN:CLOUDFLARE_STREAM_API_TOKEN"
)

for ENTRY in "${MAP[@]}"; do
  LOCAL_KEY="${ENTRY%%:*}"
  SSM_NAME="${ENTRY#*:}"
  VALUE="$(env_value "$LOCAL_KEY" "$ENV_FILE")"
  if [[ -z "$VALUE" ]]; then
    echo "skip: $LOCAL_KEY is empty in $ENV_FILE — not pushing $PREFIX/$SSM_NAME"
    continue
  fi
  echo "push: $LOCAL_KEY -> $PREFIX/$SSM_NAME"
  aws ssm put-parameter \
    --region "$REGION" \
    --name "$PREFIX/$SSM_NAME" \
    --value "$VALUE" \
    --type SecureString \
    --overwrite >/dev/null
done

echo "Done."
