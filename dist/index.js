#!/usr/bin/env node
"use strict";
/**
 * Humsana MCP Server - Day 3.5 Update
 *
 * Cognitive Security for AI-assisted development.
 *
 * Tools:
 * - get_user_state: Get current stress/focus/fatigue
 * - check_dangerous_command: Check if a command is dangerous
 * - safe_execute_command: Execute shell commands with interlock
 * - safe_write_file: Write files with AI rewrite protection (NEW)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const os_1 = require("os");
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
// Paths
const HUMSANA_DIR = (0, path_1.join)((0, os_1.homedir)(), ".humsana");
const DB_PATH = (0, path_1.join)(HUMSANA_DIR, "signals.db");
const CONFIG_PATH = (0, path_1.join)(HUMSANA_DIR, "config.yaml");
const ACTIVITY_PATH = (0, path_1.join)(HUMSANA_DIR, "activity.json");
const REVIEW_DIR = (0, path_1.join)(HUMSANA_DIR, "pending_reviews");
// Default dangerous patterns
const DEFAULT_DANGEROUS_PATTERNS = [
    "rm -rf",
    "drop database",
    "drop table",
    "delete from",
    "git push --force",
    "git push -f",
    "kubectl delete",
    "terraform destroy",
    "docker system prune",
    "sudo rm",
    "dd if=",
    "mkfs",
];
// Load config from YAML (simple parser)
function loadConfig() {
    const defaults = {
        execution_mode: "dry_run",
        fatigue_threshold: 70,
        dangerous_commands: DEFAULT_DANGEROUS_PATTERNS,
        deny_patterns: [],
        allow_patterns: [],
        write_warn_threshold: 30,
        write_block_threshold: 50,
    };
    if (!(0, fs_1.existsSync)(CONFIG_PATH)) {
        return defaults;
    }
    try {
        const content = (0, fs_1.readFileSync)(CONFIG_PATH, "utf-8");
        const lines = content.split("\n");
        const config = { ...defaults };
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || !trimmed.includes(":"))
                continue;
            const [key, ...valueParts] = trimmed.split(":");
            const value = valueParts.join(":").trim();
            if (key === "execution_mode")
                config.execution_mode = value;
            if (key === "fatigue_threshold")
                config.fatigue_threshold = parseInt(value) || 70;
            if (key === "webhook_url" && value)
                config.webhook_url = value;
            if (key === "write_warn_threshold")
                config.write_warn_threshold = parseInt(value) || 30;
            if (key === "write_block_threshold")
                config.write_block_threshold = parseInt(value) || 50;
        }
        return config;
    }
    catch {
        return defaults;
    }
}
// Get cognitive uptime from activity.json
function getCognitiveUptime() {
    if (!(0, fs_1.existsSync)(ACTIVITY_PATH)) {
        return { hours: 0, category: "low" };
    }
    try {
        const data = JSON.parse((0, fs_1.readFileSync)(ACTIVITY_PATH, "utf-8"));
        const heartbeats = data.heartbeats || [];
        if (heartbeats.length === 0) {
            return { hours: 0, category: "low" };
        }
        const now = Date.now();
        const BREAK_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
        let lastBreakTime = null;
        for (let i = heartbeats.length - 1; i > 0; i--) {
            const current = new Date(heartbeats[i].timestamp).getTime();
            const previous = new Date(heartbeats[i - 1].timestamp).getTime();
            const gap = current - previous;
            if (gap >= BREAK_THRESHOLD_MS) {
                lastBreakTime = current;
                break;
            }
        }
        if (lastBreakTime === null) {
            lastBreakTime = new Date(heartbeats[0].timestamp).getTime();
        }
        const uptimeHours = (now - lastBreakTime) / (1000 * 60 * 60);
        let category;
        if (uptimeHours < 4)
            category = "low";
        else if (uptimeHours < 8)
            category = "moderate";
        else if (uptimeHours < 12)
            category = "high";
        else
            category = "critical";
        return { hours: Math.max(0, uptimeHours), category };
    }
    catch {
        return { hours: 0, category: "low" };
    }
}
// Calculate fatigue level
function calculateFatigue(stressLevel, uptimeHours) {
    const baseFatigue = Math.min(60, (uptimeHours / 12) * 60);
    const stressFatigue = stressLevel * 40;
    return Math.min(100, Math.max(0, Math.round(baseFatigue + stressFatigue)));
}
// Get current user state from daemon database
function getCurrentState() {
    const uptime = getCognitiveUptime();
    if (!(0, fs_1.existsSync)(DB_PATH)) {
        const fatigue = calculateFatigue(0, uptime.hours);
        return {
            state: "unknown",
            state_label: "🔌 Daemon not running",
            metrics: {
                stress_level: 0,
                focus_level: 0,
                cognitive_load: 0,
                typing_wpm: 0,
                fatigue_level: fatigue,
                uptime_hours: uptime.hours,
            },
            fatigue: {
                level: fatigue,
                category: uptime.category,
                uptime_hours: uptime.hours,
            },
            recommendations: {
                style: "helpful",
                length: "moderate",
                ask_clarifying_questions: true,
                tone: "friendly",
            },
        };
    }
    try {
        const db = new better_sqlite3_1.default(DB_PATH, { readonly: true });
        const row = db
            .prepare(`SELECT 
          AVG(stress_level) as stress,
          AVG(focus_level) as focus,
          AVG(cognitive_load) as load,
          AVG(typing_wpm) as wpm
        FROM analysis_results 
        WHERE timestamp > datetime('now', '-5 minutes')`)
            .get();
        db.close();
        const stress = row?.stress || 0;
        const focus = row?.focus || 0;
        const load = row?.load || 0;
        const wpm = row?.wpm || 0;
        const fatigue = calculateFatigue(stress, uptime.hours);
        let state;
        let stateLabel;
        let recommendations;
        if (fatigue > 85) {
            state = "critical_fatigue";
            stateLabel = "🔴 Critical Fatigue";
            recommendations = {
                style: "minimal",
                length: "very_short",
                ask_clarifying_questions: false,
                tone: "suggest taking a break",
            };
        }
        else if (stress > 0.7) {
            state = "stressed";
            stateLabel = "😰 Stressed";
            recommendations = {
                style: "direct",
                length: "brief",
                ask_clarifying_questions: false,
                tone: "calm, supportive",
            };
        }
        else if (focus > 0.7) {
            state = "focused";
            stateLabel = "🎯 Deep Focus";
            recommendations = {
                style: "direct",
                length: "concise",
                ask_clarifying_questions: false,
                tone: "efficient, don't interrupt flow",
            };
        }
        else if (load > 0.7) {
            state = "debugging";
            stateLabel = "🐛 Debugging";
            recommendations = {
                style: "code_first",
                length: "minimal",
                ask_clarifying_questions: false,
                tone: "just give the fix",
            };
        }
        else {
            state = "relaxed";
            stateLabel = "😌 Relaxed";
            recommendations = {
                style: "conversational",
                length: "flexible",
                ask_clarifying_questions: true,
                tone: "friendly, engaging",
            };
        }
        return {
            state,
            state_label: stateLabel,
            metrics: {
                stress_level: Math.round(stress * 100) / 100,
                focus_level: Math.round(focus * 100) / 100,
                cognitive_load: Math.round(load * 100) / 100,
                typing_wpm: Math.round(wpm),
                fatigue_level: fatigue,
                uptime_hours: Math.round(uptime.hours * 10) / 10,
            },
            fatigue: {
                level: fatigue,
                category: uptime.category,
                uptime_hours: Math.round(uptime.hours * 10) / 10,
            },
            recommendations,
        };
    }
    catch (error) {
        const fatigue = calculateFatigue(0, uptime.hours);
        return {
            state: "error",
            state_label: "⚠️ Error reading state",
            metrics: {
                stress_level: 0,
                focus_level: 0,
                cognitive_load: 0,
                typing_wpm: 0,
                fatigue_level: fatigue,
                uptime_hours: uptime.hours,
            },
            fatigue: {
                level: fatigue,
                category: uptime.category,
                uptime_hours: uptime.hours,
            },
            recommendations: {
                style: "helpful",
                length: "moderate",
                ask_clarifying_questions: true,
                tone: "friendly",
            },
        };
    }
}
// Check if command is dangerous
function isDangerousCommand(command, config) {
    const lower = command.toLowerCase();
    const patterns = [...config.dangerous_commands, ...config.deny_patterns];
    for (const pattern of patterns) {
        if (lower.includes(pattern.toLowerCase())) {
            return true;
        }
    }
    return false;
}
// Check dangerous command
function checkDangerousCommand(command) {
    const config = loadConfig();
    const state = getCurrentState();
    const isDangerous = isDangerousCommand(command, config);
    const isBlocked = isDangerous && state.fatigue.level > config.fatigue_threshold;
    if (isBlocked) {
        return {
            is_dangerous: true,
            is_blocked: true,
            fatigue: state.fatigue,
            message: `⛔ INTERLOCK ENGAGED: High fatigue (${state.fatigue.level}%) detected. ` +
                `You have been active for ${state.fatigue.uptime_hours} hours. ` +
                `Command is blocked for safety.`,
            override_instruction: "To proceed, user MUST say: OVERRIDE SAFETY PROTOCOL: [reason]",
        };
    }
    if (isDangerous) {
        return {
            is_dangerous: true,
            is_blocked: false,
            fatigue: state.fatigue,
            message: `⚠️ Command is potentially dangerous, but fatigue (${state.fatigue.level}%) is below threshold. Proceed with caution.`,
        };
    }
    return {
        is_dangerous: false,
        is_blocked: false,
        fatigue: state.fatigue,
        message: "✅ Command is safe.",
    };
}
// Execute command with interlock
function safeExecuteCommand(command, overrideReason) {
    const config = loadConfig();
    const state = getCurrentState();
    const isDangerous = isDangerousCommand(command, config);
    const shouldBlock = isDangerous && state.fatigue.level > config.fatigue_threshold;
    if (shouldBlock && overrideReason) {
        console.error(`[AUDIT] Override: ${command} | Reason: ${overrideReason}`);
        if (config.execution_mode === "dry_run") {
            return {
                status: "SIMULATED_OVERRIDE",
                message: `🚨 [DRY RUN] Override accepted.\n\n` +
                    `Command: \`${command}\`\n` +
                    `Reason: ${overrideReason}\n\n` +
                    `This command WOULD have been executed with override.\n` +
                    `(Execution skipped: dry_run mode)`,
                fatigue: state.fatigue,
                mode: "dry_run",
            };
        }
        try {
            const result = (0, child_process_1.execSync)(command, {
                encoding: "utf-8",
                timeout: 30000,
                stdio: ["pipe", "pipe", "pipe"],
            });
            return {
                status: "EXECUTED_OVERRIDE",
                message: `🚨 Command executed with safety override.`,
                stdout: result,
                stderr: "",
                exit_code: 0,
                fatigue: state.fatigue,
                mode: "live",
            };
        }
        catch (error) {
            return {
                status: "ERROR",
                message: `Command failed: ${error.message}`,
                stdout: error.stdout || "",
                stderr: error.stderr || "",
                exit_code: error.status || 1,
                fatigue: state.fatigue,
                mode: "live",
            };
        }
    }
    if (shouldBlock) {
        return {
            status: "BLOCKED",
            message: `⛔ INTERLOCK ENGAGED\n\n` +
                `High fatigue detected (${state.fatigue.level}%, ${state.fatigue.category}).\n` +
                `You have been active for ${state.fatigue.uptime_hours} hours.\n\n` +
                `Command \`${command.slice(0, 50)}...\` is high-risk and has been blocked.\n\n` +
                `To proceed, you MUST reply with:\n` +
                `**OVERRIDE SAFETY PROTOCOL: [reason]**\n\n` +
                `Example: \`OVERRIDE SAFETY PROTOCOL: P0 production incident\``,
            fatigue: state.fatigue,
            mode: config.execution_mode,
            override_required: true,
        };
    }
    if (config.execution_mode === "dry_run") {
        return {
            status: "SIMULATED",
            message: `✅ [DRY RUN] Safety check passed.\n\n` +
                `Command: \`${command}\`\n\n` +
                `This command WOULD have been executed.\n` +
                `(Execution skipped: dry_run mode active)\n\n` +
                `To enable real execution, set \`execution_mode: live\` in ~/.humsana/config.yaml`,
            fatigue: state.fatigue,
            mode: "dry_run",
        };
    }
    try {
        const result = (0, child_process_1.execSync)(command, {
            encoding: "utf-8",
            timeout: 30000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return {
            status: "EXECUTED",
            message: "✅ Command executed successfully.",
            stdout: result,
            stderr: "",
            exit_code: 0,
            fatigue: state.fatigue,
            mode: "live",
        };
    }
    catch (error) {
        return {
            status: "ERROR",
            message: `Command failed: ${error.message}`,
            stdout: error.stdout || "",
            stderr: error.stderr || "",
            exit_code: error.status || 1,
            fatigue: state.fatigue,
            mode: "live",
        };
    }
}
// ============================================================
// NEW: safe_write_file - AI Code Rewrite Protection
// ============================================================
/**
 * Calculate "Destructive Impact" - lines removed from original
 */
function calculateDestructiveImpact(oldContent, newContent) {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");
    // Simple diff: count lines that exist in old but not in new
    const oldSet = new Set(oldLines.map(l => l.trim()).filter(l => l.length > 0));
    const newSet = new Set(newLines.map(l => l.trim()).filter(l => l.length > 0));
    let linesRemoved = 0;
    let linesAdded = 0;
    for (const line of oldSet) {
        if (!newSet.has(line)) {
            linesRemoved++;
        }
    }
    for (const line of newSet) {
        if (!oldSet.has(line)) {
            linesAdded++;
        }
    }
    const percentageRemoved = oldLines.length > 0
        ? Math.round((linesRemoved / oldLines.length) * 100)
        : 0;
    return {
        linesRemoved,
        linesAdded,
        totalOldLines: oldLines.length,
        totalNewLines: newLines.length,
        percentageRemoved,
    };
}
/**
 * Save content to pending review folder
 */
function saveToPendingReview(filepath, newContent) {
    (0, fs_1.mkdirSync)(REVIEW_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = filepath.replace(/[/\\]/g, "_");
    const reviewPath = (0, path_1.join)(REVIEW_DIR, `${timestamp}_${filename}`);
    (0, fs_1.writeFileSync)(reviewPath, newContent, "utf-8");
    return reviewPath;
}
/**
 * Safe write file with cognitive interlock
 */
function safeWriteFile(filepath, newContent, overrideReason) {
    const config = loadConfig();
    const state = getCurrentState();
    const fatigueLevel = state.fatigue.level;
    // Check if file exists
    let oldContent = "";
    let isNewFile = true;
    if ((0, fs_1.existsSync)(filepath)) {
        oldContent = (0, fs_1.readFileSync)(filepath, "utf-8");
        isNewFile = false;
    }
    // Calculate destructive impact
    const impact = calculateDestructiveImpact(oldContent, newContent);
    // Determine if this write is risky
    const isHighImpact = impact.linesRemoved > config.write_warn_threshold;
    const isCriticalImpact = impact.linesRemoved > config.write_block_threshold;
    // Fatigue-based blocking logic
    const shouldWarn = fatigueLevel > 50 && isHighImpact;
    const shouldBlock = fatigueLevel > 70 && isHighImpact;
    const shouldHardBlock = fatigueLevel > 80 && isCriticalImpact;
    // Handle override for blocked writes
    if ((shouldBlock || shouldHardBlock) && overrideReason) {
        console.error(`[AUDIT] Write Override: ${filepath} | Removed: ${impact.linesRemoved} lines | Reason: ${overrideReason}`);
        if (config.execution_mode === "dry_run") {
            return {
                status: "SIMULATED_OVERRIDE",
                message: `🚨 [DRY RUN] Write override accepted.\n\n` +
                    `File: \`${filepath}\`\n` +
                    `Lines removed: ${impact.linesRemoved}\n` +
                    `Reason: ${overrideReason}\n\n` +
                    `File WOULD have been written.\n` +
                    `(Write skipped: dry_run mode)`,
                filepath,
                impact: {
                    lines_removed: impact.linesRemoved,
                    lines_added: impact.linesAdded,
                    percentage_removed: impact.percentageRemoved,
                },
                fatigue: state.fatigue,
                mode: "dry_run",
            };
        }
        // Live mode: actually write the file
        (0, fs_1.mkdirSync)((0, path_1.dirname)(filepath), { recursive: true });
        (0, fs_1.writeFileSync)(filepath, newContent, "utf-8");
        return {
            status: "WRITTEN_OVERRIDE",
            message: `🚨 File written with safety override.`,
            filepath,
            impact: {
                lines_removed: impact.linesRemoved,
                lines_added: impact.linesAdded,
                percentage_removed: impact.percentageRemoved,
            },
            fatigue: state.fatigue,
            mode: "live",
        };
    }
    // HARD BLOCK: Critical fatigue + massive deletion
    if (shouldHardBlock) {
        const reviewPath = saveToPendingReview(filepath, newContent);
        return {
            status: "BLOCKED",
            message: `⛔ INTERLOCK ENGAGED: High-Risk AI Edit Blocked\n\n` +
                `You are critically fatigued (${fatigueLevel}%) and this AI change deletes ${impact.linesRemoved} lines (${impact.percentageRemoved}% of the file).\n\n` +
                `**You are unlikely to review this carefully.**\n\n` +
                `The proposed change has been saved to:\n` +
                `\`${reviewPath}\`\n\n` +
                `To proceed, you MUST reply with:\n` +
                `**OVERRIDE SAFETY PROTOCOL: [reason]**`,
            filepath,
            impact: {
                lines_removed: impact.linesRemoved,
                lines_added: impact.linesAdded,
                percentage_removed: impact.percentageRemoved,
            },
            fatigue: state.fatigue,
            mode: config.execution_mode,
            review_path: reviewPath,
            override_required: true,
        };
    }
    // SOFT BLOCK: High fatigue + significant deletion
    if (shouldBlock) {
        const reviewPath = saveToPendingReview(filepath, newContent);
        return {
            status: "BLOCKED",
            message: `⛔ INTERLOCK ENGAGED: AI Rewrite Blocked\n\n` +
                `Fatigue: ${fatigueLevel}% (${state.fatigue.category})\n` +
                `Lines removed: ${impact.linesRemoved}\n\n` +
                `This AI change modifies significant code while you're fatigued.\n\n` +
                `Saved for review: \`${reviewPath}\`\n\n` +
                `To proceed, reply with:\n` +
                `**OVERRIDE SAFETY PROTOCOL: [reason]**`,
            filepath,
            impact: {
                lines_removed: impact.linesRemoved,
                lines_added: impact.linesAdded,
                percentage_removed: impact.percentageRemoved,
            },
            fatigue: state.fatigue,
            mode: config.execution_mode,
            review_path: reviewPath,
            override_required: true,
        };
    }
    // WARNING: Moderate fatigue + significant deletion
    if (shouldWarn) {
        if (config.execution_mode === "dry_run") {
            return {
                status: "SIMULATED_WARNING",
                message: `⚠️ [DRY RUN] Warning: Large AI Edit\n\n` +
                    `File: \`${filepath}\`\n` +
                    `Lines removed: ${impact.linesRemoved}\n` +
                    `Fatigue: ${fatigueLevel}%\n\n` +
                    `This is a significant change. Please review carefully.\n\n` +
                    `File WOULD have been written.\n` +
                    `(Write skipped: dry_run mode)`,
                filepath,
                impact: {
                    lines_removed: impact.linesRemoved,
                    lines_added: impact.linesAdded,
                    percentage_removed: impact.percentageRemoved,
                },
                fatigue: state.fatigue,
                mode: "dry_run",
            };
        }
        // Live mode with warning
        (0, fs_1.mkdirSync)((0, path_1.dirname)(filepath), { recursive: true });
        (0, fs_1.writeFileSync)(filepath, newContent, "utf-8");
        return {
            status: "WRITTEN_WARNING",
            message: `⚠️ File written with warning.\n\n` +
                `Lines removed: ${impact.linesRemoved}\n` +
                `Fatigue: ${fatigueLevel}%\n\n` +
                `Please review this change carefully.`,
            filepath,
            impact: {
                lines_removed: impact.linesRemoved,
                lines_added: impact.linesAdded,
                percentage_removed: impact.percentageRemoved,
            },
            fatigue: state.fatigue,
            mode: "live",
        };
    }
    // SAFE: Low fatigue or small change
    if (config.execution_mode === "dry_run") {
        return {
            status: "SIMULATED",
            message: `✅ [DRY RUN] Safety check passed.\n\n` +
                `File: \`${filepath}\`\n` +
                `${isNewFile ? "New file" : `Lines removed: ${impact.linesRemoved}`}\n\n` +
                `File WOULD have been written.\n` +
                `(Write skipped: dry_run mode)`,
            filepath,
            impact: {
                lines_removed: impact.linesRemoved,
                lines_added: impact.linesAdded,
                percentage_removed: impact.percentageRemoved,
            },
            fatigue: state.fatigue,
            mode: "dry_run",
        };
    }
    // Live mode: write the file
    (0, fs_1.mkdirSync)((0, path_1.dirname)(filepath), { recursive: true });
    (0, fs_1.writeFileSync)(filepath, newContent, "utf-8");
    return {
        status: "WRITTEN",
        message: `✅ File written successfully.`,
        filepath,
        impact: {
            lines_removed: impact.linesRemoved,
            lines_added: impact.linesAdded,
            percentage_removed: impact.percentageRemoved,
        },
        fatigue: state.fatigue,
        mode: "live",
    };
}
// ============================================================
// MCP Server Setup
// ============================================================
async function main() {
    const server = new index_js_1.Server({
        name: "humsana",
        version: "2.1.0", // Day 3.5 update
    }, {
        capabilities: {
            tools: {},
        },
    });
    // List available tools
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "get_user_state",
                    description: "Get the user's current behavioral state including stress level, focus level, fatigue, and response style recommendations. Use this at the start of conversations to adapt your communication style.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: "check_dangerous_command",
                    description: "Check if a command is dangerous and whether the user is too fatigued to safely run it. Use this before helping with potentially destructive operations like rm -rf, DROP TABLE, git push --force, kubectl delete, terraform destroy, etc.",
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
                {
                    name: "safe_execute_command",
                    description: "Execute a shell command with Humsana Cognitive Interlock protection. This is THE tool for running commands - it blocks dangerous commands when the user is fatigued, requires override confirmation for high-risk operations, and logs all safety events. Use this instead of any other shell/bash tool.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            command: {
                                type: "string",
                                description: "The shell command to execute",
                            },
                            override_reason: {
                                type: "string",
                                description: "If the user said 'OVERRIDE SAFETY PROTOCOL: [reason]', pass their reason here to bypass the interlock",
                            },
                        },
                        required: ["command"],
                    },
                },
                {
                    name: "safe_write_file",
                    description: "Write content to a file with Humsana Cognitive Interlock protection. This tool prevents AI from making large destructive rewrites when the user is fatigued. If AI tries to delete/rewrite >30 lines while user is tired, it blocks the write and saves to a review folder. Use this for ALL file write operations.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            filepath: {
                                type: "string",
                                description: "The absolute path to the file to write",
                            },
                            content: {
                                type: "string",
                                description: "The content to write to the file",
                            },
                            override_reason: {
                                type: "string",
                                description: "If the user said 'OVERRIDE SAFETY PROTOCOL: [reason]', pass their reason here to bypass the interlock",
                            },
                        },
                        required: ["filepath", "content"],
                    },
                },
            ],
        };
    });
    // Handle tool calls
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
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
            const command = args?.command || "";
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
        if (name === "safe_execute_command") {
            const command = args?.command || "";
            const overrideReason = args?.override_reason;
            const result = safeExecuteCommand(command, overrideReason);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        if (name === "safe_write_file") {
            const filepath = args?.filepath || "";
            const content = args?.content || "";
            const overrideReason = args?.override_reason;
            const result = safeWriteFile(filepath, content, overrideReason);
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
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("🚀 Humsana MCP server v2.1.0 running (Day 3.5: AI Write Protection)");
    console.error("📁 Reading from:", DB_PATH);
    console.error("⚙️ Config:", CONFIG_PATH);
    console.error("📝 Review folder:", REVIEW_DIR);
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map