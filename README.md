# @humsana/mcp-server

Cognitive Security for AI-assisted development.

> 🛡️ "The breathalyzer for your terminal."

Humsana prevents you from running dangerous commands or accepting large AI code rewrites when you're fatigued. Think of it as an industrial safety interlock, but for your brain.

## What It Does

### Command Protection (`safe_execute_command`)

| Situation | Result |
|-----------|--------|
| You're fresh, running `ls` | ✅ Runs normally |
| You're fresh, running `rm -rf` | ⚠️ Warning, allowed |
| You're tired, running `rm -rf` | ⛔ **BLOCKED** — requires override |

### AI Rewrite Protection (`safe_write_file`)

| Situation | Result |
|-----------|--------|
| AI writes new file | ✅ Allowed |
| AI rewrites 10 lines | ✅ Allowed |
| You're tired + AI deletes 30+ lines | ⚠️ Warning |
| You're tired + AI deletes 50+ lines | ⛔ **BLOCKED** — saved for review |

---

## Quick Start

### 1. Install the Daemon

```bash
pip install humsana-daemon
humsana start
```

Keep this running in a terminal tab.

### 2. Install the MCP Server

```bash
npm install -g @humsana/mcp-server
```

### 3. Configure Claude Desktop

Create/edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "humsana": {
      "command": "node",
      "args": ["/path/to/humsana-mcp/dist/index.js"]
    }
  }
}
```

### 4. Restart Claude Desktop

Quit (Cmd+Q) and reopen.

### 5. Test It

Ask Claude: "What's my current state?"

---

## Execution Modes

Humsana starts in **dry-run mode** for safety. Commands are simulated, not executed.

### Dry-Run Mode (Default)

```
✅ [DRY RUN] Safety check passed.
Command: `kubectl delete pods`
This command WOULD have been executed.
(Execution skipped: dry_run mode active)
```

### Switching to Live Mode

When you trust the system, enable real execution:

**Step 1:** Create/edit `~/.humsana/config.yaml`:

```yaml
# Change this from 'dry_run' to 'live'
execution_mode: live

# Optional: adjust thresholds
fatigue_threshold: 70
write_warn_threshold: 30
write_block_threshold: 50
```

**Step 2:** Restart Claude Desktop (Cmd+Q, reopen)

**Step 3:** Test with a safe command first:

```
Run `echo "live mode working"`
```

You should see actual output instead of "WOULD have been executed."

---

## Configuration Reference

Create `~/.humsana/config.yaml`:

```yaml
# === EXECUTION MODE ===
# 'dry_run' (default) - Simulates commands, nothing executed
# 'live' - Actually executes commands and writes files
execution_mode: dry_run

# === FATIGUE THRESHOLDS ===
# Fatigue level (0-100) above which dangerous commands are blocked
fatigue_threshold: 70

# Lines removed to trigger warning (when fatigued)
write_warn_threshold: 30

# Lines removed to trigger hard block (when fatigued)
write_block_threshold: 50

# === CUSTOM PATTERNS ===
# Additional dangerous commands to block
deny_patterns:
  - "aws ec2 terminate"
  - "docker rm -f"

# === NOTIFICATIONS ===
# Webhook for Slack/PagerDuty (fires on safety overrides)
webhook_url: https://hooks.slack.com/services/XXX/YYY/ZZZ
```

---

## Override Protocol

When blocked, say:

```
OVERRIDE SAFETY PROTOCOL: [reason]
```

Example:
```
OVERRIDE SAFETY PROTOCOL: P0 production outage, need to restart pods
```

This is logged to `~/.humsana/audit.json` and sent to your webhook.

---

## Tools Available

| Tool | Purpose |
|------|---------|
| `get_user_state` | Get current stress, focus, fatigue levels |
| `check_dangerous_command` | Check if a command would be blocked |
| `safe_execute_command` | Execute shell commands with interlock |
| `safe_write_file` | Write files with AI rewrite protection |

---

## Files & Folders

| Path | Purpose |
|------|---------|
| `~/.humsana/signals.db` | Behavioral data from daemon |
| `~/.humsana/config.yaml` | Your configuration |
| `~/.humsana/activity.json` | Activity heartbeats (for fatigue) |
| `~/.humsana/audit.json` | Safety event log |
| `~/.humsana/pending_reviews/` | Blocked AI writes saved here |

---

## Privacy

🔒 **100% Local.**

- All data stays on your machine
- No network calls (except optional webhook)
- No telemetry, no tracking
- Fully auditable open-source code

---

## Troubleshooting

### "Daemon not running" error

Start the daemon in a terminal:
```bash
humsana start
```

### Commands not executing

Check your mode:
```bash
cat ~/.humsana/config.yaml | grep execution_mode
```

If it says `dry_run`, change to `live` and restart Claude.

### MCP not connecting

Verify your Claude Desktop config path:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Ensure the path to `dist/index.js` is correct

---

## License

MIT