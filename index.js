#!/usr/bin/env node
/**
 * AgentCanary MCP Server
 * 
 * Connect any MCP-compatible AI client to AgentCanary market intelligence.
 * 
 * Setup:
 *   AC_API_KEY=ac_your_key_here node index.js
 * 
 * Or in Claude Desktop config:
 *   { "command": "npx", "args": ["agentcanary-mcp"], "env": { "AC_API_KEY": "ac_..." } }
 * 
 * Tools available depend on your tier:
 *   Explorer: briefs, scores
 *   Builder:  + indicators, regime, narratives, news, predictions
 *   Signal:   + scenario analysis, full content
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.AC_API_BASE || "https://api.agentcanary.ai/api";
const API_KEY = process.env.AC_API_KEY;

if (!API_KEY) {
  console.error("Error: AC_API_KEY environment variable is required.");
  console.error("Get your key at https://agentcanary.ai or POST https://api.agentcanary.ai/api/keys/create");
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────

async function acFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "x-api-key": API_KEY, "User-Agent": "AgentCanary-MCP/1.0" },
  });
  if (res.status === 401) throw new Error("Invalid API key. Check your AC_API_KEY.");
  if (res.status === 403) throw new Error("Endpoint not available on your tier. Upgrade at agentcanary.ai");
  if (res.status === 429) throw new Error("Rate limit exceeded. Wait and try again.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AC API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function truncate(obj, maxChars = 8000) {
  const str = JSON.stringify(obj, null, 2);
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + "\n... [truncated]";
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "");
}

// ─── Tier detection (best-effort) ────────────────────────────────

let detectedTier = "explorer";

async function detectTier() {
  try {
    const res = await fetch(`${API_BASE}/keys/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: API_KEY }),
    });
    if (res.ok) {
      const data = await res.json();
      detectedTier = data.tier || "explorer";
    }
  } catch { /* default to explorer */ }
}

// ─── Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "agentcanary",
  version: "1.0.0",
});

// --- Tool: get_briefs (all tiers) ---
server.tool(
  "get_briefs",
  "Get AgentCanary market intelligence briefs (Morning Brief, Market Pulse, Signal Scan, Evening Wrap, Cycle Check). Returns headlines, tags, panels, and content.",
  {
    limit: z.number().min(1).max(50).default(10).describe("Number of briefs to return"),
    date: z.string().optional().describe("Filter by date (YYYY-MM-DD)"),
    session: z.string().optional().describe("Filter by session type: morning, midday, intelligence, evening, cycle"),
  },
  async ({ limit, date, session }) => {
    const data = await acFetch("briefs/archive", { limit });
    let briefs = data.briefs || [];
    if (date) briefs = briefs.filter(b => b.date === date);
    if (session) briefs = briefs.filter(b => b.session === session);

    const clean = briefs.map(b => ({
      date: b.date,
      session: b.session,
      time: b.time,
      headline: b.headline,
      desc: b.desc,
      tags: (b.tags || []).map(t => t.t),
      panels: b.panels,
      content: stripHtml(b.content).slice(0, 2000),
    }));
    return { content: [{ type: "text", text: truncate(clean) }] };
  }
);

// --- Tool: get_indicators (builder+) ---
server.tool(
  "get_indicators",
  "Get latest market indicators: VIX, Fear & Greed, BTC funding rates, ETF flows, stablecoin yields, oil futures, and 50+ more. Requires Builder tier or above.",
  {
    category: z.string().optional().describe("Filter by category: crypto, macro, sentiment, options, defi"),
  },
  async ({ category }) => {
    const data = await acFetch("indicators");
    let indicators = data.indicators || [];
    if (category) {
      indicators = indicators.filter(i =>
        (i.category || "").toLowerCase().includes(category.toLowerCase())
      );
    }
    return { content: [{ type: "text", text: truncate({ date: data.date, count: indicators.length, indicators }) }] };
  }
);

// --- Tool: get_regime (builder+) ---
server.tool(
  "get_regime",
  "Get current macro regime classification (expansion, stagflation, late-cycle, recession, etc.) with transition probabilities and favored/unfavored assets. Requires Builder tier or above.",
  {},
  async () => {
    const data = await acFetch("regime");
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_predictions (builder+) ---
server.tool(
  "get_predictions",
  "Get prediction market data (Polymarket, Kalshi, etc.) with probabilities for geopolitical, economic, and market events. Requires Builder tier or above.",
  {},
  async () => {
    const data = await acFetch("predictions");
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_narratives (builder+) ---
server.tool(
  "get_narratives",
  "Get narrative momentum scores — which market themes are heating up or cooling down (AI, energy, defense, crypto, healthcare, etc.). Requires Builder tier or above.",
  {},
  async () => {
    const data = await acFetch("narratives");
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_news (builder+) ---
server.tool(
  "get_news",
  "Get latest market news articles aggregated by AgentCanary. Filterable by ticker. Requires Builder tier or above.",
  {
    limit: z.number().min(1).max(30).default(10).describe("Number of articles"),
    ticker: z.string().optional().describe("Filter by ticker symbol (e.g. BTC, NVDA)"),
  },
  async ({ limit, ticker }) => {
    const params = { limit };
    if (ticker) params.ticker = ticker;
    const data = await acFetch("news", params);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_scores (all tiers) ---
server.tool(
  "get_scores",
  "Get prediction scoring results from The Record — how accurate AgentCanary's scenario price targets have been (hit/miss/partial rates with details).",
  {},
  async () => {
    try {
      const res = await fetch("https://agentcanary.ai/record/data/predictions.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const preds = data.predictions || [];

      const scored = preds.filter(p => p.result && p.result !== "pending" && p.result !== "no_data");
      const hits = scored.filter(p => p.result === "hit").length;
      const partials = scored.filter(p => p.result === "partial").length;
      const misses = scored.filter(p => p.result === "miss").length;
      const pending = preds.filter(p => p.result === "pending").length;

      const summary = {
        total: preds.length,
        scored: scored.length,
        hits,
        partials,
        misses,
        pending,
        hitRate: scored.length > 0 ? Math.round((hits / scored.length) * 100) + "%" : "N/A",
        lastScored: data.lastScored,
      };

      const byDate = {};
      for (const p of scored) {
        if (!byDate[p.date]) byDate[p.date] = [];
        byDate[p.date].push({
          scenario: `${p.scenario} — ${p.scenarioName}`,
          ticker: p.ticker,
          range: `$${p.rangeMin}-$${p.rangeMax}`,
          result: p.result,
          actualClose: p.actualClose,
        });
      }

      return { content: [{ type: "text", text: truncate({ summary, results: byDate }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Scoring data not available: ${e.message}` }] };
    }
  }
);

// --- Tool: get_scenario_analysis (signal+) ---
server.tool(
  "get_scenario_analysis",
  "Get forward scenario analysis from Signal Scan — price targets for different market scenarios (geopolitical, stagflation, risk-on, etc.) with implication. Requires Signal tier.",
  {
    date: z.string().optional().describe("Specific date (YYYY-MM-DD). Defaults to latest."),
  },
  async ({ date }) => {
    const data = await acFetch("briefs/archive", { limit: 50 });
    let briefs = (data.briefs || []).filter(b => b.session === "intelligence" || b.session === "signal");
    if (date) briefs = briefs.filter(b => b.date === date);

    const results = briefs.slice(0, 3).map(b => {
      const content = stripHtml(b.content);
      const scenarioSection = content.split("FORWARD SCENARIOS")[1]?.split("SECTOR STRENGTH")[0] || "";
      const implication = content.split("IMPLICATION")[1]?.split("\n\n")[0] || "";
      const positioning = content.split("POSITIONING")[1]?.split("IMPLICATION")[0] || "";
      return {
        date: b.date,
        headline: b.headline,
        scenarios: scenarioSection.trim(),
        positioning: positioning.trim().slice(0, 500),
        implication: implication.trim(),
      };
    });
    return { content: [{ type: "text", text: truncate(results) }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────

await detectTier();
const transport = new StdioServerTransport();
await server.connect(transport);
