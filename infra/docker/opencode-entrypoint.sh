#!/bin/sh
# OpenCode sandbox entrypoint — Z.AI direct backend (GLM-5).
# - $1 .. = prompt (passed to `opencode run`)
# - env ZHIPU_API_KEY (or Z_AI_API_KEY) = required when no /creds/auth.json mount
# - env OPENCODE_MODEL = default "zhipu-ai/glm-5"
# - env Z_AI_BASE_URL = default https://open.bigmodel.cn/api/coding/paas/v4
set -eu

mkdir -p /home/agent/.local/share/opencode
mkdir -p /home/agent/.config/opencode

# --- Auth ---
# Prefer a mounted gold-standard auth.json; otherwise synthesise one
# from the Z.AI API key in env.
if [ -f /creds/auth.json ]; then
  cp /creds/auth.json /home/agent/.local/share/opencode/auth.json
else
  KEY="${ZHIPU_API_KEY:-${Z_AI_API_KEY:-}}"
  if [ -z "$KEY" ]; then
    echo "opencode-entrypoint: no /creds/auth.json and no ZHIPU_API_KEY env" >&2
    exit 64
  fi
  cat > /home/agent/.local/share/opencode/auth.json <<JSON
{
  "zhipu-ai": { "type": "api", "key": "${KEY}" }
}
JSON
fi

# --- Provider + model config ---
# A mounted opencode.jsonc overrides the synthesised default. Otherwise
# we register the Z.AI custom provider (openai-compatible adapter,
# baseURL https://open.bigmodel.cn/api/coding/paas/v4) and pin the model to GLM-5.
if [ -f /creds/opencode.jsonc ]; then
  cp /creds/opencode.jsonc /home/agent/.config/opencode/opencode.jsonc
else
  MODEL="${OPENCODE_MODEL:-zhipu-ai/glm-5}"
  BASE_URL="${Z_AI_BASE_URL:-https://open.bigmodel.cn/api/coding/paas/v4}"
  cat > /home/agent/.config/opencode/opencode.jsonc <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "zhipu-ai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Zhipu AI (Z.AI)",
      "options": { "baseURL": "${BASE_URL}" },
      "models": {
        "glm-5":      { "name": "GLM 5" },
        "glm-5-air":  { "name": "GLM 5 Air" },
        "glm-4.7":    { "name": "GLM 4.7" }
      }
    }
  },
  "model": "${MODEL}"
}
JSON
fi

chown -R agent:agent /home/agent
chmod 0600 /home/agent/.local/share/opencode/auth.json 2>/dev/null || true

exec su-exec agent env HOME=/home/agent opencode run "$@"
