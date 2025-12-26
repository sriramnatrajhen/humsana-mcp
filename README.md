# @humsana/mcp-server

MCP server for Humsana — AI that reads the room.

This package connects Claude Desktop to your local Humsana daemon, allowing Claude to adapt responses based on your current mental state.

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

## What It Does

Claude will now have access to:

### 🎯 Your Current State

| State | Claude's Response Style |
|-------|------------------------|
| 😌 Relaxed | Friendly, detailed, asks questions |
| 💼 Working | Helpful, professional |
| 🎯 Focused | Direct, won't interrupt your flow |
| 😰 Stressed | Brief, gets to the point |
| 🔴 Debugging | Minimal, just gives the fix |

### ⚠️ Dangerous Command Detection

When you're stressed and ask about commands like `rm -rf` or `DROP TABLE`, Claude will warn you:

> ⚠️ HUMSANA ALERT: You appear to be stressed (78% stress) and are about to run a destructive command. Take a breath. Are you absolutely sure?

## Tools Available to Claude

### `get_user_state`

Returns your current behavioral state:

```json
{
  "state": "focused",
  "state_label": "🎯 Deep Focus",
  "metrics": {
    "stress_level": 0.25,
    "focus_level": 0.82,
    "cognitive_load": 0.45,
    "typing_wpm": 65
  },
  "recommendations": {
    "style": "direct",
    "length": "moderate",
    "ask_clarifying_questions": false,
    "tone": "efficient, don't interrupt flow"
  }
}
```

### `check_dangerous_command`

Checks if a command is dangerous and whether you're in a state to safely run it.

## Privacy

🔒 **100% Local.** This server only reads from `~/.humsana/signals.db` on your machine. No network calls. No data sent anywhere.

## License

MIT