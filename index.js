#!/usr/bin/env node
/**
 * AgentCanary MCP Server
 * 
 * Connect any MCP-compatible AI client to AgentCanary market intelligence.
 * 
 * Setup:
 *   node index.js
 *   AC_API_KEY=ac_your_key_here node index.js   # required for tiered tools
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
const MCP_VERSION = "1.4.5";

const DATE_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const TICKER_SCHEMA = z.string().regex(/^[A-Za-z0-9._:-]{1,20}$/, "ticker must be 1-20 ticker-safe characters");
const INDICATOR_NAME_SCHEMA = z.string().regex(/^[a-z0-9-]{1,64}$/, "indicator name must be lowercase letters, numbers, and hyphens");
const BRIEF_SESSION_SCHEMA = z.enum(["radar", "signal", "pulse", "wrap", "morning", "intelligence", "midday", "evening"]);
const INDICATOR_CATEGORY_SCHEMA = z.enum(["crypto", "macro", "sentiment", "technical", "liquidity"]);
const SIGNAL_TYPE_SCHEMA = z.enum([
  "whale-alerts",
  "fear-greed",
  "funding-rates",
  "btc-etf-flows",
  "vix",
  "credit-stress",
  "sector-rotation",
  "insider-activity",
  "correlations",
  "dxy",
  "oil",
  "yield-curve",
  "market-structure",
  "stablecoin-dominance",
  "whale-positions",
  "cftc-cot",
  "bofa-fms",
  "dispersion",
  "geopolitical-risk",
  "decision-engine",
]);
const DEFI_CATEGORY_SCHEMA = z.enum(["yields", "pe-ratios", "stablecoins", "chains", "unlocks", "perps", "signals", "intelligence"]);
const BTC_OPTIONS_VIEW_SCHEMA = z.enum(["maxpain", "skew"]);
const MARKET_STRUCTURE_VIEW_SCHEMA = z.enum(["orderbook", "liquidation-heatmap", "liquidation-ranges", "exchange-assets", "exchange-volumes", "coinbase"]);
const CENTRAL_BANKS_VIEW_SCHEMA = z.enum(["balance-sheets", "gold", "btc", "stablecoins", "reserves", "tic"]);
const EXPECTATIONS_VIEW_SCHEMA = z.enum(["crowded", "early", "rotation"]);
const MACRO_VIEW_SCHEMA = z.enum(["snapshot", "business-cycle", "global-liquidity", "us-m2", "supply-chain", "calendar-high-impact", "risk-score", "signals"]);
const OPEN_INTEREST_VIEW_SCHEMA = z.enum(["top", "shifters"]);

// ─── Helpers ─────────────────────────────────────────────────────

function hasApiKey() {
  return typeof API_KEY === "string" && API_KEY.trim().length > 0;
}

function requireApiKey() {
  if (!hasApiKey()) {
    throw new Error("[auth_required] AC_API_KEY is required for this tiered tool. Public tool available without a key: get_track_record. Get a key at https://agentcanary.ai or POST https://api.agentcanary.ai/api/keys/create");
  }
  return API_KEY;
}

async function acFetch(endpoint, params = {}) {
  const apiKey = requireApiKey();
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      "x-api-key": apiKey,
      "User-Agent": `AgentCanary-MCP/${MCP_VERSION}`,
    },
  });

  // Try to parse JSON error body for backend-structured errors. If response
  // isn't JSON, fall back to raw text.
  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = { raw: (await res.text()).slice(0, 300) }; }

    // 401: auth
    if (res.status === 401) {
      const code = body.error || "auth_required";
      throw new Error(`[${code}] ${body.message || "Invalid or missing API key. Check AC_API_KEY."}`);
    }

    // 403: tier OR scope
    if (res.status === 403) {
      if (body.error === "tier_insufficient") {
        const curr = body.currentTier || "explorer";
        const req = body.requiredTier || "unknown";
        const dep = body.depositAddress ? ` Deposit to ${body.depositAddress} on Base.` : "";
        throw new Error(`[tier_insufficient] Need ${req} tier (you're on ${curr}).${dep} Details: https://agentcanary.ai/#pricing`);
      }
      if (body.error === "scope_insufficient") {
        const reqScope = body.requiredScope || "?";
        const keyScopes = Array.isArray(body.keyScopes) ? body.keyScopes.join(",") : "?";
        throw new Error(`[scope_insufficient] Key needs scope "${reqScope}" — currently has [${keyScopes}]. Re-issue key with broader scopes.`);
      }
      throw new Error(`[forbidden] ${body.message || "Access denied."}`);
    }

    // 429: rate limit
    if (res.status === 429) {
      const retry = body.retryAfterSeconds ? ` Retry after ${body.retryAfterSeconds}s.` : "";
      throw new Error(`[rate_limited] ${body.message || "Rate limit exceeded."}${retry}`);
    }

    // 402: insufficient credits
    if (res.status === 402) {
      const credits = body.creditsRemaining ?? "?";
      throw new Error(`[insufficient_credits] ${credits} credits left. Top up via deposit on Base.`);
    }

    // 5xx + everything else
    throw new Error(`[ac_api_${res.status}] ${body.message || body.error || body.raw || JSON.stringify(body).slice(0, 200)}`);
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
  if (!hasApiKey()) return;
  try {
    const res = await fetch(`${API_BASE}/keys/info`, {
      headers: {
        "x-api-key": API_KEY,
        "User-Agent": `AgentCanary-MCP/${MCP_VERSION}`,
      },
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
  version: MCP_VERSION,
});

// --- Tool: get_briefs (all tiers) ---
server.tool(
  "get_briefs",
  "Get AgentCanary market intelligence briefs (Macro Radar 03:15Z, Signal Scan 09:15Z, Market Pulse 15:15Z, Market Wrap 21:15Z). Returns headlines, tags, panels, and content. Examples: get_briefs({limit: 5}) — last 5 briefs · get_briefs({date: \"2026-05-19\"}) — all 4 slots for one day · get_briefs({session: \"radar\"}) — last 10 morning radar briefs. All tiers (Explorer gets headlines+desc, Builder+ get full content).",
  {
    limit: z.number().min(1).max(50).default(10).describe("Number of briefs to return"),
    date: DATE_SCHEMA.optional().describe("Filter by date (YYYY-MM-DD)"),
    session: BRIEF_SESSION_SCHEMA.optional().describe("Filter by session: radar (03:15Z) | signal (09:15Z) | pulse (15:15Z) | wrap (21:15Z). Legacy names accepted: morning, intelligence, midday, evening."),
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
  "Get market indicators (36 proprietary). Examples: get_indicators() — list all with category/score · get_indicators({name: \"bull-market-support-band\"}) — single indicator detail · get_indicators({category: \"sentiment\"}) — sentiment-only subset. Common names: bull-market-support-band, btc-pi-cycle, wyckoff-structure, stablecoin-composite, composite-risk-score. Builder tier or above.",
  {
    name: INDICATOR_NAME_SCHEMA.optional().describe("Specific indicator name, e.g. 'bull-market-support-band', 'btc-pi-cycle', 'wyckoff-structure'"),
    category: INDICATOR_CATEGORY_SCHEMA.optional().describe("Filter by category: crypto, macro, sentiment, technical, liquidity"),
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
    ticker: TICKER_SCHEMA.optional().describe("Filter by ticker symbol (e.g. BTC, NVDA)"),
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
    date: DATE_SCHEMA.optional().describe("Specific date (YYYY-MM-DD). Defaults to latest."),
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
    type: SIGNAL_TYPE_SCHEMA.optional().describe("Signal type: whale-alerts, fear-greed, funding-rates, btc-etf-flows, vix, credit-stress, sector-rotation, insider-activity, correlations, dxy, oil, yield-curve, market-structure, stablecoin-dominance, whale-positions, cftc-cot, bofa-fms, dispersion, geopolitical-risk, decision-engine"),
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
    category: DEFI_CATEGORY_SCHEMA.optional().describe("Category: yields, pe-ratios, stablecoins, chains, unlocks, perps, signals, intelligence"),
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
    view: BTC_OPTIONS_VIEW_SCHEMA.optional().describe("View: maxpain, skew. Omit for overview."),
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
    view: MARKET_STRUCTURE_VIEW_SCHEMA.optional().describe("View: orderbook, liquidation-heatmap, liquidation-ranges, exchange-assets, exchange-volumes, coinbase. Omit for orderbook."),
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
    view: CENTRAL_BANKS_VIEW_SCHEMA.optional().describe("View: balance-sheets, gold, btc, stablecoins, reserves, tic. Omit for overview."),
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
    view: EXPECTATIONS_VIEW_SCHEMA.optional().describe("View: crowded, early, rotation. Omit for overview."),
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
    view: MACRO_VIEW_SCHEMA.optional().describe("View: snapshot, business-cycle, global-liquidity, us-m2, supply-chain, calendar-high-impact, risk-score, signals. Omit for regime."),
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
    view: OPEN_INTEREST_VIEW_SCHEMA.optional().describe("View: 'top' (top symbols by OI USD), 'shifters' (top intraday OI movers by 4h Δ%). Omit for full snapshot (aggregate + top + shifters + envelope)."),
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


// --- Tool: diagnose (public/key-aware) ---
// Returns current key state + tier + scopes + credits. Use this when a tool
// errors out — gives the agent enough context to choose an alternative or
// escalate to the operator.
server.tool(
  "diagnose",
  "Diagnose the current API key state. Without AC_API_KEY, reports that only public tools are available. With AC_API_KEY, returns tier, scopes, credits remaining, rate limit, last-used timestamp, recent activity summary, and upgrade path.",
  {},
  async () => {
    if (!hasApiKey()) {
      const summary = {
        mcp_version: MCP_VERSION,
        api_base: API_BASE,
        key_present: false,
        public_tools_available: ["get_track_record"],
        auth_required_for: "all tiered AgentCanary API tools",
        get_key: "https://agentcanary.ai or POST https://api.agentcanary.ai/api/keys/create",
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
    const apiKey = requireApiKey();
    // Pull key info via the /keys/info endpoint (already used by detectTier)
    const res = await fetch(`${API_BASE}/keys/info`, {
      headers: {
        "x-api-key": apiKey,
        "User-Agent": `AgentCanary-MCP/${MCP_VERSION}`,
      },
    });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      return { content: [{ type: "text", text: `Diagnose failed (${res.status}): ${t}` }] };
    }
    const data = await res.json();
    const summary = {
      mcp_version: MCP_VERSION,
      api_base: API_BASE,
      key_prefix: apiKey.slice(0, 8) + "…",
      tier: data.tier || "explorer",
      status: data.status || "active",
      scopes: data.scopes || ["all"],
      credits: data.credits ?? null,
      rate_limit: data.rateLimit || null,
      last_used_at: data.lastUsedAt || null,
      docs: "https://agentcanary.ai/sources/ + https://api.agentcanary.ai/api/docs",
      upgrade_path: data.tier === "explorer"
        ? "Deposit $50 USDC on Base to upgrade to Builder tier"
        : data.tier === "builder"
        ? "Deposit $150 cumulative to upgrade to Signal tier"
        : data.tier === "signal"
        ? "Deposit $500 cumulative to upgrade to Institutional"
        : "You're at the top tier",
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }
);


// --- Tool: get_track_record (public, no auth) ---
// Exposes the public Brier + per-asset hit-rate data that powers /record/.
// This is the differentiator — designed to be agent-discoverable without
// requiring an API key. Calls /api/track-record (free, no auth).
server.tool(
  "get_track_record",
  "Get AgentCanary's public hit/miss track record: mean Brier score, per-scenario calibration, reliability table (predicted vs observed probability buckets), per-asset hit rates. No API key required — this surface is public. Examples: get_track_record() returns full summary across all assets · get_track_record({ticker: 'SPY'}) returns just SPY's hit rate. Updated every 3h via the brief-grading pipeline.",
  {
    ticker: TICKER_SCHEMA.optional().describe("Optional ticker filter (e.g. 'SPY', 'BTC', 'GLD', 'OIL', 'VIX'). Omit for full summary across all tracked assets."),
  },
  async ({ ticker }) => {
    const url = new URL(`${API_BASE}/track-record`);
    if (ticker) url.searchParams.set("ticker", ticker);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": `AgentCanary-MCP/${MCP_VERSION}` },
    });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      return { content: [{ type: "text", text: `[track_record_unavailable] ${res.status}: ${t}` }] };
    }
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────

await detectTier();
const transport = new StdioServerTransport();
await server.connect(transport);
