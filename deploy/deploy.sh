#!/usr/bin/env bash
# athkarnfc — Deploy to GCP VM
# Usage: bash deploy/deploy.sh
# Requires: gcloud CLI configured, VM name + zone set below

set -euo pipefail

VM_NAME="athkarnfc-vm"
VM_ZONE="us-central1-a"
REMOTE_DIR="/var/www/athkarnfc"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Syncing project to $VM_NAME:$REMOTE_DIR ..."
gcloud compute scp --recurse --zone="$VM_ZONE" \
    "$LOCAL_DIR/index.html" \
    "$LOCAL_DIR/assets" \
    "${VM_NAME}:${REMOTE_DIR}/"

echo "==> Setting permissions on remote ..."
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command="
    sudo chown -R www-data:www-data $REMOTE_DIR;
    sudo chmod -R 755 $REMOTE_DIR;
"

echo "==> Done. Visit your domain to verify."
