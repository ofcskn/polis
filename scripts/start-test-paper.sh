#!/usr/bin/env bash
set -euo pipefail
docker run -d --rm \
  --name polis-test-paper \
  -p 25566:25565 \
  -e EULA=TRUE \
  -e ONLINE_MODE=FALSE \
  -e TYPE=PAPER \
  -e VERSION=1.21.8 \
  -e MEMORY=1G \
  -e ENFORCE_SECURE_PROFILE=false \
  itzg/minecraft-server
echo "Waiting for Paper to accept connections..."
until docker logs polis-test-paper 2>&1 | grep -q "Done"; do
  sleep 2
done
echo "Paper is ready on port 25566"
