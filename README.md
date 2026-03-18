# AgentCanary MCP Server

Connect any MCP-compatible AI client to [AgentCanary](https://agentcanary.ai) market intelligence.

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

## Tools

| Tool | Tier | Description |
|------|------|-------------|
| `get_briefs` | Explorer | Latest AI market briefs (4x daily) |
| `get_regime` | Explorer | Current macro regime + risk gauge |
| `get_indicator` | Builder | Any of 36 proprietary indicators |
| `get_narratives` | Signal | Narrative momentum scores |
| `get_scenarios` | Signal | Forward scenario probabilities |
| `get_whale_alerts` | Explorer | Large crypto transactions |
| `get_fear_greed` | Explorer | Crypto Fear & Greed Index |
| `get_signals` | Signal | Multi-factor trading signals |

## Links

- [API Docs](https://api.agentcanary.ai/api/docs)
- [Website](https://agentcanary.ai)
- [Telegram](https://t.me/AgentCanary)

## License

MIT
