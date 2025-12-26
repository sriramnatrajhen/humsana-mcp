#!/usr/bin/env node
/**
 * Humsana MCP Server
 * 
 * Serves user behavioral state to Claude Desktop via MCP protocol.
 * Reads from local SQLite database (~/.humsana/signals.db) created by humsana-daemon.
 * 
 * 🔒 Privacy: All data is local. No network calls. No data exfiltration.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

// Database path (same as humsana-daemon)
const DB_PATH = join(homedir(), ".humsana", "signals.db");

// State labels for human-readable output
const STATE_LABELS: Record<string, string> = {
  relaxed: "😌 Relaxed",
  working: "💼 Working",
  focused: "🎯 Deep Focus",
  stressed: "😰 Stressed",
  debugging: "🔴 Debugging",
};

// Response style recommendations
const RESPONSE_STYLES: Record<string, object> = {
  relaxed: {
    style: "friendly",
    length: "detailed",
    include_examples: true,
    ask_clarifying_questions: true,
    tone: "warm and conversational",
  },
  working: {
    style: "helpful",
    length: "detailed",
    include_examples: true,
    ask_clarifying_questions: true,
    tone: "professional",
  },
  focused: {
    style: "direct",
    length: "moderate",
    include_examples: false,
    ask_clarifying_questions: false,
    tone: "efficient, don't interrupt flow",
  },
  stressed: {
    style: "concise",
    length: "brief",
    include_examples: false,
    ask_clarifying_questions: false,
    tone: "calm and direct, get to the point",
  },
  debugging: {
    style: "solution-focused",
    length: "minimal",
    include_examples: false,
    ask_clarifying_questions: false,
    tone: "technical, just give the fix",
  },
};

interface AnalysisRow {
  id: number;
  timestamp: string;
  stress_level: number;
  focus_level: number;
  cognitive_load: number;
  state: string;
  confidence: number;
  response_style: string;
  avoid_clarifying_questions: number;
  interruptible: number;
  typing_wpm: number;
  backspace_ratio: number;
  rhythm_variance: number;
  idle_seconds: number;
}

interface AverageMetrics {
  avg_stress: number | null;
  avg_focus: number | null;
  avg_cognitive_load: number | null;
  avg_wpm: number | null;
  sample_count: number;
}

/**
 * Get the current user state from the local database
 */
function getCurrentState(): object {
  // Check if database exists
  if (!existsSync(DB_PATH)) {
    return {
      error: "Humsana daemon not running",
      message: "Start the daemon with: humsana start",
      state: "unknown",
      recommendations: RESPONSE_STYLES.relaxed,
    };
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Get average metrics over last 5 minutes
    const metricsStmt = db.prepare(`
      SELECT 
        AVG(stress_level) as avg_stress,
        AVG(focus_level) as avg_focus,
        AVG(cognitive_load) as avg_cognitive_load,
        AVG(typing_wpm) as avg_wpm,
        COUNT(*) as sample_count
      FROM analysis_results
      WHERE timestamp > datetime('now', '-5 minutes')
    `);
    const metrics = metricsStmt.get() as AverageMetrics;

    // Get dominant state
    const stateStmt = db.prepare(`
      SELECT state, COUNT(*) as count
      FROM analysis_results
      WHERE timestamp > datetime('now', '-5 minutes')
      GROUP BY state
      ORDER BY count DESC
      LIMIT 1
    `);
    const stateRow = stateStmt.get() as { state: string; count: number } | undefined;

    // Get most recent analysis for detailed info
    const recentStmt = db.prepare(`
      SELECT * FROM analysis_results
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const recent = recentStmt.get() as AnalysisRow | undefined;

    db.close();

    // Check if we have data
    if (!metrics || metrics.sample_count === 0) {
      return {
        error: "No recent data",
        message: "Type something to generate behavioral signals",
        state: "unknown",
        recommendations: RESPONSE_STYLES.relaxed,
      };
    }

    const state = stateRow?.state || "relaxed";

    return {
      state: state,
      state_label: STATE_LABELS[state] || state,
      
      metrics: {
        stress_level: round(metrics.avg_stress || 0),
        focus_level: round(metrics.avg_focus || 0),
        cognitive_load: round(metrics.avg_cognitive_load || 0),
        typing_wpm: round(metrics.avg_wpm || 0),
        sample_count: metrics.sample_count,
        window_minutes: 5,
      },
      
      recommendations: RESPONSE_STYLES[state] || RESPONSE_STYLES.relaxed,
      
      current: recent ? {
        interruptible: recent.interruptible === 1,
        avoid_clarifying_questions: recent.avoid_clarifying_questions === 1,
        idle_seconds: round(recent.idle_seconds),
        confidence: round(recent.confidence),
      } : null,
      
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error: "Database error",
      message: String(error),
      state: "unknown",
      recommendations: RESPONSE_STYLES.relaxed,
    };
  }
}

/**
 * Check if a command is dangerous and user is stressed
 */
function checkDangerousCommand(command: string): object {
  const DANGEROUS_PATTERNS = [
    /rm\s+(-rf?|--recursive|--force)/i,
    /DROP\s+(DATABASE|TABLE|SCHEMA)/i,
    /DELETE\s+FROM/i,
    /git\s+push\s+(--force|-f)/i,
    /kubectl\s+delete/i,
    /terraform\s+destroy/i,
    /docker\s+(system\s+prune|rm\s+-f)/i,
    /sudo\s+rm/i,
    /mkfs/i,
    /dd\s+if=/i,
  ];

  const isDangerous = DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
  
  if (!isDangerous) {
    return { dangerous: false, alert: null };
  }

  // Check current stress level
  const state = getCurrentState() as any;
  const stressLevel = state.metrics?.stress_level || 0;
  const userState = state.state || "relaxed";

  if (stressLevel > 0.6 || userState === "stressed" || userState === "debugging") {
    return {
      dangerous: true,
      stress_level: stressLevel,
      state: userState,
      alert: `⚠️ HUMSANA ALERT: You appear to be ${userState} (${Math.round(stressLevel * 100)}% stress) and are about to run a destructive command. Take a breath. Are you absolutely sure?`,
      recommendation: "Consider waiting until you're calmer, or double-check the command carefully.",
    };
  }

  return {
    dangerous: true,
    stress_level: stressLevel,
    state: userState,
    alert: null,
    note: "Command is potentially dangerous, but you seem calm. Proceed with caution.",
  };
}

function round(n: number, decimals: number = 2): number {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Main MCP Server
 */
async function main() {
  const server = new Server(
    {
      name: "humsana",
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "humsana://state/current",
          name: "Current User State",
          description: "Get the user's current behavioral state (stress, focus, cognitive load)",
          mimeType: "application/json",
        },
      ],
    };
  });

  // Read a resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "humsana://state/current") {
      const state = getCurrentState();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_user_state",
          description: "Get the user's current behavioral state including stress level, focus level, and response style recommendations. Use this at the start of conversations to adapt your communication style.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "check_dangerous_command",
          description: "Check if a command is dangerous and whether the user is in a stressed state. Use this before helping with potentially destructive operations like rm -rf, DROP TABLE, git push --force, etc.",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "The command to check",
              },
            },
            required: ["command"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "get_user_state") {
      const state = getCurrentState();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }

    if (name === "check_dangerous_command") {
      const command = (args as { command?: string })?.command || "";
      const result = checkDangerousCommand(command);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("🚀 Humsana MCP server running");
  console.error("📁 Reading from:", DB_PATH);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});