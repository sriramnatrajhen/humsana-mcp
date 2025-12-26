# @humsana/mcp-server

MCP server for Humsana — The Cognitive Interlock for Claude Desktop.

> 🛡️ "The breathalyzer for your terminal."

This package prevents you from running dangerous commands when you're fatigued. Think of it as an industrial safety interlock, but for your brain.

## What It Does

| Situation | What Happens |
|-----------|--------------|
| You're fresh, running `ls` | ✅ Just runs |
| You're fresh, running `rm -rf` | ⚠️ Warning, but allowed |
| You're tired, running `rm -rf` | ⛔ **BLOCKED** — requires override |
| You override with reason | 🚨 Logged, then executed |

## Prerequisites

You need the Humsana daemon running:

```bash
pip install humsana-daemon
humsana start
```

## Installation

```bash
npm install -g @humsana/mcp-server
```

## Claude Desktop Setup

Add to `~/.config/Claude/claude_desktop_config.json` (Mac/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "humsana": {
      "command": "npx",
      "args": ["@humsana/mcp-server"]
    }
  }
}
```

Restart Claude Desktop.

## Tools Available to Claude

### `get_user_state`

Returns your current behavioral state and fatigue:

```json
{
  "state": "focused",
  "state_label": "🎯 Deep Focus",
  "metrics": {
    "stress_level": 0.25,
    "focus_level": 0.82,
    "fatigue_level": 45,
    "uptime_hours": 4.5
  },
  "fatigue": {
    "level": 45,
    "category": "moderate",
    "uptime_hours": 4.5
  },
  "recommendations": {
    "style": "direct",
    "tone": "efficient, don't interrupt flow"
  }
}
```

### `check_dangerous_command`

Checks if a command is dangerous and whether you're too fatigued to run it safely.

### `safe_execute_command` ⭐ NEW

**THE wrapper tool for running commands.** This replaces any other shell/bash tool.

- Checks fatigue level before execution
- Blocks dangerous commands when fatigued
- Requires "OVERRIDE SAFETY PROTOCOL: [reason]" to proceed
- Logs all safety events for post-mortems

## Execution Modes

Configure in `~/.humsana/config.yaml`:

### Dry Run (Default — Safe for Testing)

```yaml
execution_mode: dry_run
```

Commands are simulated, not executed. Perfect for trying out the interlock.

### Live Mode

```yaml
execution_mode: live
```

Commands are actually executed. Only enable after you trust the system.

## Configuration

Create `~/.humsana/config.yaml`:

```yaml
# Execution mode: 'dry_run' (default) or 'live'
execution_mode: dry_run

# Fatigue threshold (0-100). Above this, dangerous commands are blocked.
fatigue_threshold: 70

# Additional patterns to block
deny_patterns:
  - "aws ec2 terminate"
  - "docker rm -f"

# Webhook for Slack/PagerDuty notifications
webhook_url: https://hooks.slack.com/services/XXX/YYY/ZZZ
```

## Override Protocol

When blocked, you must say:

```
OVERRIDE SAFETY PROTOCOL: [reason]
```

Example:
```
OVERRIDE SAFETY PROTOCOL: P0 production outage, need to restart pods
```

This is logged for post-mortem analysis.

## Privacy

🔒 **100% Local.** 

- Reads from `~/.humsana/signals.db` on your machine
- No network calls (except optional webhook)
- No data sent to any server
- Fully auditable open-source code

## Files

| File | Purpose |
|------|---------|
| `~/.humsana/signals.db` | Behavioral data from daemon |
| `~/.humsana/config.yaml` | Your configuration |
| `~/.humsana/activity.json` | Activity heartbeats for fatigue |
| `~/.humsana/audit.json` | Safety event log |

## License

MIT