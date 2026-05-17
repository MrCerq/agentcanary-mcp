# AgentCanary MCP Server

MCP server for [AgentCanary](https://agentcanary.ai) — decision-grade market intelligence for autonomous AI agents. Regime classifications, risk scores, narrative momentum, scenario probabilities, and public track-record-verified signals via 17 MCP tools.

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

## Get an API Key

```bash
curl -X POST https://api.agentcanary.ai/api/keys/create \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0xYourWallet"}'
```

Deposit USDC/USDT on any major EVM chain (Base, Ethereum, Arbitrum, Optimism, Polygon). $5 minimum. Credits never expire.

## Tools (17)

| Tool | Returns |
|------|---------|
| `get_briefs` | Daily market intelligence briefs (4×/day: radar / signal / pulse / wrap) |
| `get_regime` | Current macro regime, risk gauge (0-100), key drivers, transition probabilities |
| `get_indicators` | Any of 50+ proprietary indicators (Pi Cycle, Wyckoff, CAPE, Hindenburg…) — pass `name=` |
| `get_narratives` | Top active narratives with momentum scores, stage, asset impact |
| `get_predictions` | Prediction market data (Polymarket, Kalshi) |
| `get_scores` | Prediction scoring results (hit / miss / partial after 72h) |
| `get_scenario_analysis` | Forward scenarios with price targets |
| `get_signals` | 20 sub-types via `type=`: whale-alerts, fear-greed, funding-rates, btc-etf-flows, vix, credit-stress, sector-rotation, insider-activity, correlations, dxy, oil, yield-curve, market-structure, stablecoin-dominance, whale-positions, cftc-cot, bofa-fms, dispersion, geopolitical-risk, decision-engine |
| `get_news` | Aggregated market news, filterable by ticker |
| `get_market_structure` | Orderbook depth, liquidation heatmap, exchange volumes — pass `view=` |
| `get_defi` | DeFi yields, stablecoins, chains, unlocks, perps — pass `category=` |
| `get_btc_options` | BTC options max pain + volatility skew |
| `get_central_banks` | Balance sheets, gold, reserves, TIC — pass `view=` |
| `get_expectations` | Market expectations (crowded, early, rotation) |
| `get_macro` | FRED, business cycle, global liquidity, M2, supply chain, high-impact calendar |
| `get_open_interest` | Cross-exchange OI across 43 perps + top by USD + 4h Δ% shifters |
| `get_liquidations` | 24h totals + 4h long/short split + per-side event counts + dominant-direction label |

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
