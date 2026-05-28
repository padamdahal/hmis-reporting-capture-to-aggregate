#!/usr/bin/env bash

set -e

# Load .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
else
    echo "❌ .env file not found"
    exit 1
fi

# Strip hidden characters
DHIS2_URL=$(echo "$DHIS2_URL" | tr -d '\r')
APP_ZIP=$(echo "$APP_ZIP"     | tr -d '\r')

# VALIDATION
if [ -z "$DHIS2_URL" ]; then
  echo "DHIS2_URL missing in .env"
  exit 1
fi

if [ -z "$APP_ZIP" ]; then
  echo "APP_ZIP missing in .env"
  exit 1
fi

echo "Server URL: $DHIS2_URL"

# ASK FOR CREDENTIALS
read -p "DHIS2 Username: " USERNAME
read -s -p "DHIS2 Password: " PASSWORD
echo ""

# VERIFY ZIP EXISTS
if [ ! -f "$APP_ZIP" ]; then
  echo "App zip not found: $APP_ZIP"
  exit 1
fi

# DEPLOY
echo "Deploying app to $DHIS2_URL"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
-X POST \
-u "$USERNAME:$PASSWORD" \
-F "file=@${APP_ZIP}" \
"$DHIS2_URL")

if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "201" ]; then
  echo "✅ App deployed successfully"
else
  echo "❌ Deployment failed with status: $RESPONSE"
  exit 1
fi