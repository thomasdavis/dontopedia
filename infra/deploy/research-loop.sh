#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3000/api/research}"
SUBJECT_IRI="${SUBJECT_IRI:-ex:thomas-davis-ajax}"
MAX_CONCURRENT="${MAX_CONCURRENT:-3}"
POLL_SECONDS="${POLL_SECONDS:-45}"
START_SPACING_SECONDS="${START_SPACING_SECONDS:-8}"
STATE_DIR="${STATE_DIR:-/var/lib/dontopedia-research-loop}"
LOG_FILE="${LOG_FILE:-/var/log/dontopedia-research-loop.log}"
PID_FILE="${PID_FILE:-$STATE_DIR/research-loop.pid}"
INDEX_FILE="${INDEX_FILE:-$STATE_DIR/prompt-index}"

mkdir -p "$STATE_DIR"
touch "$LOG_FILE"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "research loop already running with pid $existing_pid" >&2
    exit 1
  fi
fi

echo "$$" > "$PID_FILE"
cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

if [[ ! -f "$INDEX_FILE" ]]; then
  echo "0" > "$INDEX_FILE"
fi

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

active_sandboxes() {
  docker ps --format '{{.Names}}' | awk '/^codex-/ { n++ } END { print n + 0 }'
}

log_line() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE"
}

prompts=(
  "Research Thomas Davis Ajax with a focus on archived websites and dated historical pages: old personal sites, startup profile pages, speaker bios, meetup and conference pages, early blog posts, and legacy project homepages from roughly 2008 to 2018. Prefer primary or contemporaneous dated sources."
  "Research Thomas Davis Ajax with a focus on collaborators, organizations, and relationship facts: cofounders, teammates, maintainers, employers, clients, campaigns, conferences, and projects tied to other people or groups. Prefer primary sources and dated pages that clearly identify the relationship."
  "Research Thomas Davis Ajax with a focus on official and semi-official records: ABN and business registry pages, company about pages, government records, university or school pages, press releases, and formal biographies. Prefer sources with explicit dates, legal names, and roles."
  "Research Thomas Davis Ajax with a focus on Queensland local history, Atherton and Innisfail references, school records, community news, competition mentions, family notices, and archived early-web pages. Prefer dated primary or contemporaneous sources."
  "Research Thomas Davis Ajax with a focus on open source history: GitHub repos, package metadata, project homepages, changelogs, release posts, conference bios, README credits, and interviews connected to cdnjs, JSON Resume, Donto, Dontopedia, and related projects. Prefer primary sources and dated pages."
  "Research Thomas Davis Ajax with a focus on company and employment history: Earbits, Blockbid, Tokenized, business profiles, founder pages, staff bios, podcast appearances, startup directories, and press coverage. Prefer primary sources and explicitly dated sources where possible."
  "Research Thomas Davis Ajax with a focus on interview and media material: podcasts, videos, conference talks, livestream notes, quoted interviews, and founder story posts. Extract direct quotes and dated claims with sources."
  "Research Thomas Davis Ajax with a focus on biographies and profile pages: about pages, speaker profiles, personal websites, social profile bios, startup directories, resumes, and author boxes. Prefer primary sources and keep dated role changes separate."
  "Research Thomas Davis Ajax with a focus on project launch history: release announcements, changelogs, product pages, repo histories, archived homepages, and blog posts for projects he authored or cofounded. Prefer dated primary sources."
  "Research Thomas Davis Ajax with a focus on activism, campaigns, civic tech, and community work: Fight for the Future, The Day We Fight Back, petitions, advocacy tools, campaign code, event pages, and related organization pages. Prefer primary sources and dated pages."
)

log_line "research loop starting for $SUBJECT_IRI with max_concurrent=$MAX_CONCURRENT"

while true; do
  active="$(active_sandboxes)"
  if [[ ! "$active" =~ ^[0-9]+$ ]]; then
    active=0
  fi

  slots=$((MAX_CONCURRENT - active))
  if (( slots > 0 )); then
    for ((slot = 0; slot < slots; slot++)); do
      idx="$(cat "$INDEX_FILE")"
      if [[ ! "$idx" =~ ^[0-9]+$ ]]; then
        idx=0
      fi

      prompt_index=$((idx % ${#prompts[@]}))
      prompt="${prompts[$prompt_index]}"
      payload="$(printf '{"query":"%s","subjectIri":"%s"}' "$(json_escape "$prompt")" "$(json_escape "$SUBJECT_IRI")")"
      response="$(curl -fsS -X POST "$API_URL" -H 'content-type: application/json' --data "$payload" || true)"
      session_id="$(printf '%s' "$response" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')"

      if [[ -n "$session_id" ]]; then
        log_line "started session=$session_id prompt_index=$prompt_index"
        echo $((idx + 1)) > "$INDEX_FILE"
      else
        log_line "failed to start session prompt_index=$prompt_index response=$response"
      fi

      sleep "$START_SPACING_SECONDS"
      active="$(active_sandboxes)"
      if [[ "$active" =~ ^[0-9]+$ ]] && (( active >= MAX_CONCURRENT )); then
        break
      fi
    done
  fi

  sleep "$POLL_SECONDS"
done
