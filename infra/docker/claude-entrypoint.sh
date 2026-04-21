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

# Wire up reddit-mcp-buddy. NOTE: Reddit blocks datacenter IPs so the MCP
# may return 403 from cloud instances. Claude should fall back to WebSearch
# with site:reddit.com queries when this happens. The MCP is kept installed
# because it works fine from residential IPs / local dev.
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

exec su-exec claude claude \
  --print \
  --permission-mode bypassPermissions \
  --allowed-tools "WebSearch,WebFetch,Bash,Read,Grep,Glob,mcp__reddit__search_posts,mcp__reddit__get_post_details,mcp__reddit__get_subreddit_posts,mcp__reddit__get_user_posts,mcp__reddit__get_user_comments,mcp__reddit__get_user_about,mcp__reddit__search_subreddits" \
  --mcp-config /home/claude/.claude/mcp.json \
  -- "$@"
