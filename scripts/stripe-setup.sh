#!/usr/bin/env bash
# One-time Stripe billing setup: signs in as the admin, then calls
# billing-api's admin_setup, which idempotently creates the four plan
# prices (by lookup key) and the stripe-webhook endpoint in Stripe.
#
# Usage:  bash scripts/stripe-setup.sh
# (Prompts for the admin login; or set ADMIN_EMAIL / ADMIN_PASSWORD.)
#
# Equivalent UI path once the frontend is deployed: sign in as the admin
# → Menu → Admin → Billing tab → "Run Stripe setup".
set -euo pipefail

cd "$(dirname "$0")/.."
KEY=$(grep '^REACT_APP_SUPABASE_ANON_KEY=' .env | cut -d= -f2)
URL=$(grep '^REACT_APP_SUPABASE_URL=' .env | cut -d= -f2)

EMAIL="${ADMIN_EMAIL:-}"
PASSWORD="${ADMIN_PASSWORD:-}"
[ -z "$EMAIL" ] && read -r -p "Admin email: " EMAIL
[ -z "$PASSWORD" ] && { read -r -s -p "Admin password: " PASSWORD; echo; }

TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
  python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')

if [ -z "$TOKEN" ]; then
  echo "Login failed — check the email/password (and that the account has the admin role)." >&2
  exit 1
fi

curl -s -X POST "$URL/functions/v1/billing-api" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"admin_setup"}' | python3 -m json.tool
