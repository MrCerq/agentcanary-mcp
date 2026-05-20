# AgentCanary MCP Server

MCP server for [AgentCanary](https://agentcanary.ai) — decision-grade market intelligence for autonomous AI agents. Regime classifications, risk scores, narrative momentum, scenario probabilities, and public track-record-verified signals via 18 MCP tools.

## Quick Start

```bash
npx agentcanary-mcp
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "agentcanary": {
      "command": "npx",
      "args": ["agentcanary-mcp"],
      "env": { "AC_API_KEY": "ac_your_key_here" }
    }
  }
}
```


## Cursor Config

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentcanary": {
      "command": "npx",
      "args": ["-y", "agentcanary-mcp"],
      "env": { "AC_API_KEY": "ac_your_key_here" }
    }
  }
}
```

Restart Cursor → all 18 tools available via Composer.

## Windsurf Config

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agentcanary": {
      "command": "npx",
      "args": ["-y", "agentcanary-mcp"],
      "env": { "AC_API_KEY": "ac_your_key_here" }
    }
  }
}
```

## Continue.dev Config

`~/.continue/config.json` → `experimental.modelContextProtocolServers`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "agentcanary-mcp"],
          "env": { "AC_API_KEY": "ac_your_key_here" }
        }
      }
    ]
  }
}
```

## Get an API Key

```bash
curl -X POST https://api.agentcanary.ai/api/keys/create \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0xYourWallet"}'
```

Deposit USDC/USDT on any major EVM chain (Base, Ethereum, Arbitrum, Optimism, Polygon). $5 minimum. Credits never expire.

## Tools (18)

| Tool | Tier | Returns |
|------|------|---------|
| `get_briefs` | Explorer | Daily market intelligence briefs (4×/day: radar / signal / pulse / wrap) |
| `get_regime` | Builder | Current macro regime, risk gauge (0-100), key drivers, transition probabilities |
| `get_indicators` | Builder | Any of 36 proprietary indicators (Bull Market Support Band, Pi Cycle, Wyckoff, CAPE, Hindenburg…) — pass `name=` |
| `get_narratives` | Builder | Top active narratives with momentum scores, stage, asset impact |
| `get_predictions` | Builder | Prediction market data (Polymarket, Kalshi) |
| `get_scores` | Explorer | Prediction scoring results (hit / partial / miss after 72h) |
| `get_scenario_analysis` | Signal | Forward scenarios with price targets |
| `get_signals` | Builder+ | 20 sub-types via `type=`: whale-alerts, fear-greed, funding-rates, btc-etf-flows, vix, credit-stress, sector-rotation, insider-activity, correlations, dxy, oil, yield-curve, market-structure, stablecoin-dominance, whale-positions, cftc-cot, bofa-fms, dispersion, geopolitical-risk, decision-engine |
| `get_news` | Builder | Aggregated market news, filterable by ticker |
| `get_market_structure` | Builder | Orderbook depth, liquidation heatmap, exchange volumes — pass `view=` |
| `get_defi` | Builder | DeFi yields, stablecoins, chains, unlocks, perps — pass `category=` |
| `get_btc_options` | Builder | BTC options max pain + volatility skew |
| `get_central_banks` | Signal | Balance sheets, gold, reserves, TIC — pass `view=` |
| `get_expectations` | Signal | Market expectations (crowded, early, rotation) |
| `get_macro` | Builder | FRED, business cycle, global liquidity, M2, supply chain, high-impact calendar |
| `get_open_interest` | Builder | Cross-exchange OI across 43 perps + top by USD + 4h Δ% shifters |
| `get_liquidations` | Builder | 24h totals + 4h long/short split + per-side event counts + dominant-direction label |
| `diagnose` | Explorer | Current key state: tier, scopes, credits, rate limit, upgrade path. Call when any tool returns tier_insufficient / scope_insufficient / insufficient_credits. |
| `get_track_record` | Public | Mean Brier + per-asset hit rates + reliability buckets. No API key needed — same data as agentcanary.ai/record/. Optional ticker filter. |

## Pricing

| Tier | Deposit | Calls/day | Adds |
|------|---------|-----------|------|
| Explorer | free | 50 | briefs + scores |
| Builder | $50 USDC | 500 | + indicators / regime / narratives / news / predictions |
| Signal | $150 USDC | 2000 | + scenarios / positioning / full content |
| Institutional | $500 USDC | unlimited | white-label, SLA |

Per-call cost: $0.01-0.02 from deposit. Credits never expire. No subscriptions.

## Links

- [API Docs (OpenAPI)](https://api.agentcanary.ai/api/docs)
- [Website](https://agentcanary.ai)
- [The Record (public brief archive)](https://agentcanary.ai/record/)
- [Telegram](https://t.me/AgentCanary)

## License

MIT

## Diagnose Tool

If any other tool returns `tier_insufficient`, `scope_insufficient`, or `insufficient_credits`, call `diagnose` for the exact upgrade path:

```
{
  "mcp_version": "1.4.0",
  "tier": "explorer",
  "scopes": ["all"],
  "credits": 50,
  "upgrade_path": "Deposit $50 USDC on Base to upgrade to Builder tier"
}
```

## Tier-Aware Errors

Errors are now structured. Examples:

- `[tier_insufficient]` — endpoint requires a higher tier than your key carries
- `[scope_insufficient]` — your key has restricted scopes (re-issue with broader)
- `[insufficient_credits]` — top up via deposit on Base
- `[rate_limited]` — includes `Retry after Ns`

