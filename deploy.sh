#!/usr/bin/env bash

set -e

# ==========================================
# LOAD ENV FILE
# ==========================================

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo ".env file not found"
  exit 1
fi

# ==========================================
# VALIDATION
# ==========================================

if [ -z "$DHIS2_URL" ]; then
  echo "DHIS2_URL missing in .env"
  exit 1
fi

if [ -z "$APP_ZIP" ]; then
  echo "APP_ZIP missing in .env"
  exit 1
fi

# ==========================================
# ASK FOR CREDENTIALS
# ==========================================

read -p "DHIS2 Username: " USERNAME
read -s -p "DHIS2 Password: " PASSWORD
echo ""

# ==========================================
# VERIFY ZIP EXISTS
# ==========================================

if [ ! -f "$APP_ZIP" ]; then
  echo "App zip not found: $APP_ZIP"
  exit 1
fi

# ==========================================
# DEPLOY
# ==========================================

echo "Deploying app to $DHIS2_URL"

curl -X POST \
  -u "$USERNAME:$PASSWORD" \
  -F file=@"$APP_ZIP" \
  "$DHIS2_URL/api/apps"

echo ""
echo "Deployment successful"