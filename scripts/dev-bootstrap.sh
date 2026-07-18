#!/usr/bin/env bash
# One-shot local dev bootstrap: docker daemon (if needed) + Supabase stack +
# migrations + seed. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not running — attempting to start dockerd..."
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for i in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || { echo "Could not start dockerd"; exit 1; }
fi

docker compose -f docker/docker-compose.yml up -d --wait
npm run db:migrate
npm run db:seed
echo "Local stack ready: db :54322, supabase gateway :54321. Run: npm run dev"
