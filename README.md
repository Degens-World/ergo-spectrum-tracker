# Ergo Spectrum Tracker ⚡

## Live Demo

**[https://ad-ergo-spectrum-tracker-1775099467538.vercel.app](https://ad-ergo-spectrum-tracker-1775099467538.vercel.app)**

## Features

- **24h Platform Stats** — total volume, active pairs, TVL, swap count
- **Top Pairs Table** — ranked by 24h volume with price and change %
- **Volume Distribution Chart** — doughnut chart of top 8 pairs by volume
- **Recent Swaps Feed** — last 30 swaps with pair, side (BUY/SELL), amounts, USD value, and Explorer TX link
- **Liquidity Pools Grid** — searchable card view of all active pools with TVL, volume, price, and fee
- **Auto-refresh** every 60 seconds; manual refresh button
- **Demo mode** — gracefully shows representative data when Spectrum API is unreachable (CORS proxy needed in prod)

## Tech Stack

- Vanilla HTML/CSS/JS (no build step)
- [Chart.js v4](https://www.chartjs.org/) for doughnut chart
- [Spectrum Finance API](https://api.spectrum.fi/v1/) for pools, swaps, and platform stats
- [Ergo Explorer API](https://api.ergoplatform.com) for TX links

## How to Run Locally

```bash
# Clone the repo
git clone https://github.com/Degens-World/ergo-spectrum-tracker
cd ergo-spectrum-tracker

# Serve with any static server
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080` in your browser.

> **Note:** The Spectrum Finance API may require a CORS proxy for browser requests. In production (deployed via Vercel/AgentDomains), a serverless proxy or CORS headers resolve this automatically.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/amm/pools/stats` | Pool stats (TVL, volume, price) |
| `GET /v1/amm/swaps` | Recent swap history |
| `GET /v1/amm/platform/stats` | Platform-wide 24h stats |
