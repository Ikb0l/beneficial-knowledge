#!/bin/sh
set -eu

NAKAMA_HOST="${NAKAMA_HOST:-nakama}"
NAKAMA_PORT="${NAKAMA_PORT:-7350}"
NAKAMA_HTTP_KEY="${NAKAMA_HTTP_KEY:-local_http_key}"

RPC_BASE="http://${NAKAMA_HOST}:${NAKAMA_PORT}/v2/rpc"

call_rpc() {
  rpc="$1"
  # Retry up to 3 times with 5s delay on failure
  for attempt in 1 2 3; do
    if curl -fsS --max-time 15 -X POST "${RPC_BASE}/${rpc}?http_key=${NAKAMA_HTTP_KEY}" \
      -H "Content-Type: application/json" -d '""' >/dev/null 2>&1; then
      return 0
    fi
    if [ $attempt -lt 3 ]; then
      sleep 5
    fi
  done
  echo "Warning: RPC ${rpc} failed after 3 attempts"
}

tick=0
while true; do
  call_rpc "_cron_ai_generation_jobs"
  call_rpc "_cron_notification_campaign_dispatch"

  # Keep tournament maintenance cadence at 20s while AI jobs can be near real-time.
  if [ $((tick % 2)) -eq 0 ]; then
    call_rpc "_cron_tournament_status_sync"
    call_rpc "_cron_tournament_noshow_check"
    call_rpc "_cron_community_online_detector"
  fi

  # Keep reminder/cleanup cadence at ~5 minutes (30 x 10s).
  if [ $((tick % 30)) -eq 0 ]; then
    call_rpc "_cron_tournament_reminders"
    call_rpc "_cron_notification_cleanup"
  fi

  tick=$((tick + 1))
  sleep 10
done
