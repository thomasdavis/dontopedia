#!/bin/sh
# Copy host-mounted creds into claude-user's home, then drop to that uid
# via su-exec and run claude --print. See claude-sandbox.Dockerfile for
# the isolation guarantees around this container.
set -eu

if [ -f /creds/.claude.json ]; then
  cp /creds/.claude.json /home/claude/.claude.json
fi
if [ -d /creds/.claude ]; then
  cp -r /creds/.claude /home/claude/.claude
fi
chown -R claude:claude /home/claude
chmod 0600 /home/claude/.claude.json 2>/dev/null || true

# Wire up reddit-mcp-buddy as an MCP server so Claude can browse Reddit
# (search posts, read threads, analyze users) during research sessions.
# The MCP config goes in the claude settings directory.
mkdir -p /home/claude/.claude
cat > /home/claude/.claude/mcp.json << 'MCP'
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["-y", "reddit-mcp-buddy"]
    }
  }
}
MCP
chown claude:claude /home/claude/.claude/mcp.json

# --allowed-tools is a variadic flag; passing a comma-separated single
# arg stops it from greedily swallowing the prompt.
# Added mcp__reddit__* to allowed tools so all Reddit MCP tools are usable.
exec su-exec claude claude \
  --print \
  --permission-mode bypassPermissions \
  --allowed-tools "WebSearch,WebFetch,Bash,Read,Grep,Glob,mcp__reddit__search_posts,mcp__reddit__get_post_details,mcp__reddit__get_subreddit_posts,mcp__reddit__get_user_posts,mcp__reddit__get_user_comments,mcp__reddit__get_user_about,mcp__reddit__search_subreddits" \
  --mcp-config /home/claude/.claude/mcp.json \
  -- "$@"
