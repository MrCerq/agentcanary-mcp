#!/usr/bin/env node
/**
 * AgentCanary MCP Server
 *
 * AgentCanary's public API/MCP product is retired. The package remains
 * installable so existing clients get a clear answer instead of a broken
 * process, a missing API-key error, or calls into the retired API host.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MCP_VERSION = "1.4.8";
const RETIRED_AT = "2026-07-09";
const X_URL = "https://x.com/agentcanaryHQ";
const TELEGRAM_URL = "https://t.me/agentcanary";
const SITE_URL = "https://agentcanary.ai";

const LEGACY_TOOLS = [
  "get_briefs",
  "get_indicators",
  "get_regime",
  "get_predictions",
  "get_narratives",
  "get_news",
  "get_scores",
  "get_scenario_analysis",
  "get_signals",
  "get_defi",
  "get_btc_options",
  "get_market_structure",
  "get_central_banks",
  "get_expectations",
  "get_macro",
  "get_open_interest",
  "get_liquidations",
];

function retirementPayload(tool) {
  return {
    status: "retired",
    tool,
    retired_at: RETIRED_AT,
    message: "AgentCanary's public API and MCP product are offline. Daily briefs continue on X and Telegram while the product is rebuilt.",
    x: X_URL,
    telegram: TELEGRAM_URL,
    site: SITE_URL,
    mcp_version: MCP_VERSION,
  };
}

function textResponse(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: "agentcanary",
  version: MCP_VERSION,
});

for (const tool of LEGACY_TOOLS) {
  server.tool(
    tool,
    "Retired AgentCanary MCP tool. Returns the retirement notice and current X/Telegram brief locations.",
    {},
    async () => textResponse(retirementPayload(tool)),
  );
}

server.tool(
  "diagnose",
  "Show the AgentCanary MCP retirement status. No API key required.",
  {},
  async () => textResponse({
    ...retirementPayload("diagnose"),
    api_key_required: false,
    api_base: null,
  }),
);

server.tool(
  "get_track_record",
  "Retired AgentCanary public track-record tool. No API key required.",
  {
    ticker: z.string().regex(/^[A-Za-z0-9._:-]{1,20}$/).optional().describe("Ignored legacy ticker filter."),
  },
  async ({ ticker }) => textResponse({
    ...retirementPayload("get_track_record"),
    requested_ticker: ticker || null,
    track_record_status: "offline",
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
