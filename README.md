# AgentCanary MCP Server

AgentCanary's public API and MCP product were retired on 2026-07-09.

The npm package remains as a compatibility stub so existing MCP clients start cleanly and receive a clear retirement notice instead of failing on API keys or retired endpoints.

Daily AgentCanary briefs continue here:

- X: https://x.com/agentcanaryHQ
- Telegram: https://t.me/agentcanary
- Site: https://agentcanary.ai

## Usage

```bash
npx agentcanary-mcp
```

No configuration is required. All legacy tools return the same retired-status payload with the current X and Telegram locations.

## Tools

The server keeps the legacy tool names registered for compatibility:

- `get_briefs`
- `get_indicators`
- `get_regime`
- `get_predictions`
- `get_narratives`
- `get_news`
- `get_scores`
- `get_scenario_analysis`
- `get_signals`
- `get_defi`
- `get_btc_options`
- `get_market_structure`
- `get_central_banks`
- `get_expectations`
- `get_macro`
- `get_open_interest`
- `get_liquidations`
- `diagnose`
- `get_track_record`

These tools do not contact retired AgentCanary product endpoints.
