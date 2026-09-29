#!/usr/bin/env bash
# Override VM_NAME, VM_ZONE and REMOTE_DIR as needed. No credentials are stored here.
set -euo pipefail
VM_NAME="${VM_NAME:-athkarnfc-vm}"
VM_ZONE="${VM_ZONE:-us-central1-a}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/athkarnfc}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Restrict paths used in remote shell commands to simple absolute paths.
[[ "$REMOTE_DIR" =~ ^/[a-zA-Z0-9_/-]+$ && "$REMOTE_DIR" != / ]] || { echo 'Invalid REMOTE_DIR' >&2; exit 1; }
FILES=()
while IFS= read -r path; do
    [[ -e "$LOCAL_DIR/$path" ]] || { echo "Missing deployment asset: $path" >&2; exit 1; }
    FILES+=("$LOCAL_DIR/$path")
done < "$LOCAL_DIR/deploy/files.txt"
# Stage in the SSH user's home; the served directory may be owned by www-data.
STAGING="athkarnfc-upload-$(date +%s)-$$"
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command="mkdir -p '$STAGING'"
gcloud compute scp --recurse --zone="$VM_ZONE" "${FILES[@]}" "${VM_NAME}:$STAGING/"
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command="
    set -eu
    sudo mkdir -p '$REMOTE_DIR'
    sudo cp -R '$STAGING/.' '$REMOTE_DIR/'
    sudo chown -R www-data:www-data '$REMOTE_DIR'
    sudo find '$REMOTE_DIR' -type d -exec chmod 755 {} +
    sudo find '$REMOTE_DIR' -type f -exec chmod 644 {} +
    rm -rf '$STAGING'
"
echo 'Deployment complete. Verify playback and offline saving on your domain.'
