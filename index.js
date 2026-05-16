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
  version: "1.2.0",
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
  "Get market indicators. 36 proprietary indicators including Bull Market Support Band, Pi Cycle, Wyckoff Structure, Stablecoin Composite, Composite Risk Score, and more. Pass a name for a single indicator, or list all. Requires Builder tier or above.",
  {
    name: z.string().optional().describe("Specific indicator name, e.g. 'bull-market-support-band', 'btc-pi-cycle', 'wyckoff-structure'"),
    category: z.string().optional().describe("Filter by category: crypto, macro, sentiment, technical, liquidity"),
  },
  async ({ name, category }) => {
    if (name) {
      const data = await acFetch(`indicators/${name}`);
      return { content: [{ type: "text", text: truncate(data) }] };
    }
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
  "Get aggregated market news from multiple feeds (crypto, equities, macro, geopolitics). Each article returns title, summary, source, publish timestamp, and sentiment tags (POSITIVE / NEGATIVE / NEUTRAL). Filterable by ticker for asset-specific news. Useful for agents tracking catalysts, doing event-driven analysis, or feeding LLM summarization pipelines. Builder tier or above.",
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

// --- Tool: get_signals (signal+) ---
server.tool(
  "get_signals",
  "Get trading signals — whale alerts, fear & greed, funding rates, BTC ETF flows, VIX, credit stress, sector rotation, insider activity, DXY, oil, yield curve, and more. Pass a type for specific signal.",
  {
    type: z.string().optional().describe("Signal type: whale-alerts, fear-greed, funding-rates, btc-etf-flows, vix, credit-stress, sector-rotation, insider-activity, correlations, dxy, oil, yield-curve, market-structure, stablecoin-dominance, whale-positions, cftc-cot, bofa-fms, dispersion, geopolitical-risk, decision-engine"),
  },
  async ({ type }) => {
    const endpoint = type ? `signals/${type}` : "signals/decision-engine";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_defi (signal+) ---
server.tool(
  "get_defi",
  "Get DeFi intelligence — yields, PE ratios, stablecoin flows, chain activity, token unlocks, perp funding. Pass a category for specific data.",
  {
    category: z.string().optional().describe("Category: yields, pe-ratios, stablecoins, chains, unlocks, perps, signals, intelligence"),
  },
  async ({ category }) => {
    const endpoint = category ? `defi/${category}` : "defi/intelligence";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_btc_options (signal+) ---
server.tool(
  "get_btc_options",
  "Get BTC options data — pass view= for maxpain (max pain price) or skew (volatility skew). Omit for overview (includes max pain + skew + put/call ratios). Key for understanding institutional positioning.",
  {
    view: z.string().optional().describe("View: maxpain, skew. Omit for overview."),
  },
  async ({ view }) => {
    const endpoint = view ? `btc-options/${view}` : "btc-options";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_market_structure (signal+) ---
server.tool(
  "get_market_structure",
  "Get market structure & exchange data — pass view= for one of: orderbook (depth across exchanges), liquidation-heatmap (BTC leverage liquidation map), liquidation-ranges, exchange-assets (token listings by venue), exchange-volumes (trading volumes by exchange), coinbase (Coinbase-specific metrics). Omit for orderbook (default). Covers the leverage/depth/venue data that complements directional signals from get_signals.",
  {
    view: z.string().optional().describe("View: orderbook, liquidation-heatmap, liquidation-ranges, exchange-assets, exchange-volumes, coinbase. Omit for orderbook."),
  },
  async ({ view }) => {
    const map = {
      orderbook: "orderbook/depth",
      "liquidation-heatmap": "btc-liquidation-heatmap",
      "liquidation-ranges": "liquidation-ranges",
      "exchange-assets": "exchange-assets",
      "exchange-volumes": "exchange-volumes",
      coinbase: "coinbase",
    };
    const endpoint = map[view] || map.orderbook;
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_central_banks (signal+) ---
server.tool(
  "get_central_banks",
  "Get central bank positioning data across Fed, ECB, BOJ, PBOC, and major sovereigns. Views: balance-sheets (total assets + YoY change), gold (reserves + accumulation rate), btc (sovereign BTC holdings, post-2024 trend), stablecoins (US dollar exposure via USDC/USDT reserves), reserves (composition shifts), tic (Treasury International Capital flows = who's buying/selling US debt). Useful for agents detecting de-dollarization signals, sovereign rotation, or institutional positioning shifts ahead of macro moves. Signal tier.",
  {
    view: z.string().optional().describe("View: balance-sheets, gold, btc, stablecoins, reserves, tic. Omit for overview."),
  },
  async ({ view }) => {
    const endpoint = view ? `central-banks/${view}` : "central-banks";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_expectations (signal+) ---
server.tool(
  "get_expectations",
  "Get positioning-vs-consensus signals. Views: crowded (narratives scoring 4-5 in momentum + high positioning concentration = contrarian sell signals), early (narratives scoring 1-2 = under-the-radar opportunities before consensus forms), rotation (sector/narrative flows showing where capital is moving FROM and TO). Each view returns ranked lists with deltas + the underlying signals driving the score. Useful for agents running contrarian strategies, mean-reversion plays, or trying to front-run consensus shifts. Signal tier.",
  {
    view: z.string().optional().describe("View: crowded, early, rotation. Omit for overview."),
  },
  async ({ view }) => {
    const endpoint = view ? `expectations/${view}` : "expectations";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_macro (builder+) ---
server.tool(
  "get_macro",
  "Get macro state across 30+ FRED series + derived composites. Views: snapshot (full macro dashboard with regime, gauges, key rates), business-cycle (LEI, claims, yield curve, recession probability), global-liquidity (CB balance sheets aggregated, M2 trend, credit spreads, Baltic Dry shipping), us-m2 (US money supply YoY), supply-chain (stress index), calendar-high-impact (next 72h of high-impact economic events with prev/forecast), risk-score (0-100 composite), signals (binary trigger states). Omit view for regime classification (expansion/stagflation/late-cycle/recession). Useful for agents conditioning on macro regime before tactical decisions. Builder tier or above.",
  {
    view: z.string().optional().describe("View: snapshot, business-cycle, global-liquidity, us-m2, supply-chain, calendar-high-impact, risk-score, signals. Omit for regime."),
  },
  async ({ view }) => {
    const endpoint = view ? `macro/${view}` : "macro/regime";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_open_interest (builder+) ---
// Live derivatives positioning across 43 tracked perps × 21 exchanges.
// Sourced from coinglass-v2; refreshes ~hourly upstream. Same atom that
// powers the OPEN INTEREST section of the pulse brief.
server.tool(
  "get_open_interest",
  "Get cross-exchange open-interest snapshot for crypto perps. Aggregate OI across 43 symbols + top-N by USD size + top-N by absolute 4h Δ% (intraday OI shifters). Useful for agents detecting positioning unwinds, new builds, leveraged crowding. Builder tier or above.",
  {
    view: z.string().optional().describe("View: 'top' (top symbols by OI USD), 'shifters' (top intraday OI movers by 4h Δ%). Omit for full snapshot (aggregate + top + shifters + envelope)."),
  },
  async ({ view }) => {
    const endpoint = view ? `derivatives/oi/${view}` : "derivatives/oi";
    const data = await acFetch(endpoint);
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// --- Tool: get_liquidations (builder+) ---
// 24h aggregate + latest 4h breakdown with long/short USD split, per-side
// event counts, dominant-direction label. Same atom that powers the
// Liquidations line of the pulse brief.
server.tool(
  "get_liquidations",
  "Get crypto perp liquidations. 24h total + latest-4h breakdown with long/short USD split, per-side event counts, long%/short%, and dominant-direction label (long-dominant >=65%, short-dominant <=35%, balanced). Useful for agents detecting forced deleveraging direction. Builder tier or above.",
  {},
  async () => {
    const data = await acFetch("derivatives/liquidations");
    return { content: [{ type: "text", text: truncate(data) }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────

await detectTier();
const transport = new StdioServerTransport();
await server.connect(transport);
