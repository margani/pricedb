# PriceDB

[![ci](https://github.com/margani/pricedb/actions/workflows/ci.yml/badge.svg)](https://github.com/margani/pricedb/actions/workflows/ci.yml)
[![deploy](https://github.com/margani/pricedb/actions/workflows/deploy.yml/badge.svg)](https://github.com/margani/pricedb/actions/workflows/deploy.yml)
[![USD](https://api.priceto.day/v1/badge/irr/usd?rounding=1&unit=Toman&color=green)](https://priceto.day)

Free-market prices in Iran for the US dollar, euro, pound, gold and coins, taken from [tgju.org](https://www.tgju.org) every 30 minutes during market hours and served as a free API: no key, no sign-up, CORS enabled.

- **Website:** [priceto.day](https://priceto.day). Prices, charts and changes in Persian or English.
- **API:** [api.priceto.day](https://api.priceto.day) has an introduction with examples. Full documentation is on [prices.readme.io](https://prices.readme.io/), and the spec is in [`openapi.yaml`](openapi.yaml).
- **Also:** a [Telegram bot](#telegram-bot), an [MCP server](#mcp-server) for Claude, and the full history as a [monthly CSV dataset](#dataset).

## Usage

For example, the latest price of USD in IRR:

```bash
curl https://api.priceto.day/v1/latest/irr/usd
```

Or in PowerShell:

```pwsh
$(Invoke-WebRequest 'https://api.priceto.day/v1/latest/irr/usd').Content
```

The list of symbols is at `https://api.priceto.day/v1/symbols`.

### Status

- `/v1/health`: when prices were last updated. Returns 503 when the updates have stalled.
- `/v1/version`: the deployed version and git commit.
- `/v1/stats`: API requests and distinct users per day. IPs are kept only as a daily-salted hash and deleted the next day.

Prices don't change on Fridays or after Thursday afternoon, when Iran's market is closed.

## Telegram bot

[@Price2DayBot](https://t.me/Price2DayBot) on Telegram sends a daily report after the evening update and lets anyone set price alerts:

- `/price usd` — latest price
- `/alert usd > 280000` — message me when the dollar goes above 280,000 Toman (`<` for below)
- `/alerts`, `/unalert 3` — list and remove alerts

## MCP server

Ask Claude (or any MCP client) about prices directly. The server at `https://api.priceto.day/mcp` (Streamable HTTP, no authentication) offers the tools `list_symbols`, `get_latest_price`, `get_price_history`, `get_price_change` and `convert`.

- Claude Code: `claude mcp add --transport http pricedb https://api.priceto.day/mcp`
- Claude (web/desktop): Settings → Connectors → Add custom connector → `https://api.priceto.day/mcp`

## Dataset

The full price history of all 29 tracked symbols (daily since 2023-12, plus every 30-minute update) is published as CSV on the 1st of each month: see the [`dataset-*` releases](https://github.com/margani/pricedb/releases). The current data can also be downloaded any time from `https://api.priceto.day/v1/dataset/daily.csv` and `.../hourly.csv`.

## Sources

Prices come from [tgju.org](https://www.tgju.org). The dollar is cross-checked against USDT on the [Bitpin](https://bitpin.ir) exchange every 30 minutes (an alert fires when they differ by more than 5%), and either can be requested: `/v1/latest/irr/usd?source=bitpin` or `?source=average`.

## CSV and RSS

- History as CSV: `https://api.priceto.day/v1/history/irr/usd?from=2025-01-01&format=csv`
- Daily prices as an RSS feed: `https://api.priceto.day/v1/feed.xml`

## Badges

Embed live prices in a README or web page. Optional query parameters: `label`, `rounding` (divide by 10^n), `precision`, `unit` and `color` (a name such as `green` or a hex code).

![USD](https://api.priceto.day/v1/badge/irr/usd?rounding=1&unit=Toman&color=green)
![Gold Miskal](https://api.priceto.day/v1/badge/irr/gold-miskal?label=Gold%20Miskal&rounding=7&precision=1&unit=M%20Toman)

```md
![USD](https://api.priceto.day/v1/badge/irr/usd?rounding=1&unit=Toman&color=green)
```

## Charts

* [USD to 1k Toman Chart](https://api.priceto.day/v1/chart/irr/usd?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%AF%D9%84%D8%A7%D8%B1%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت دلار به هزار تومان")
* [GBP to 1k Toman Chart](https://api.priceto.day/v1/chart/irr/gbp?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%BE%D9%88%D9%86%D8%AF%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت پوند به هزار تومان")
* [EUR to 1k Toman Chart](https://api.priceto.day/v1/chart/irr/euro?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%DB%8C%D9%88%D8%B1%D9%88%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت یورو به هزار تومان")
* [Gold Miskal to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/gold-miskal?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%85%D8%AB%D9%82%D8%A7%D9%84%20%D8%B7%D9%84%D8%A7%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت مثقال طلا به میلیون تومان")
* [Sekke Emami to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-emami?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A7%D9%85%D8%A7%D9%85%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه امامی به میلیون تومان")
* [Sekke Bahar Azadi to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه بهار آزادی به میلیون تومان")
* [Sekke Bahar Azadi to USD](https://api.priceto.day/v1/chart/usd/coin-baharazadi?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D8%AF%D9%84%D8%A7%D8%B1 "نمودار قیمت سکه بهار آزادی به دلار")
* [Sekke Bahar Azadi to GBP](https://api.priceto.day/v1/chart/gbp/coin-baharazadi?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%BE%D9%88%D9%86%D8%AF "نمودار قیمت سکه بهار آزادی به پوند")
* [Sekke Bahar Azadi to EUR](https://api.priceto.day/v1/chart/euro/coin-baharazadi?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%DB%8C%D9%88%D8%B1%D9%88 "نمودار قیمت سکه بهار آزادی به یورو")
* [Nim Sekke Bahar Azadi to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi-nim?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%86%DB%8C%D9%85%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت نیم سکه بهار آزادی به میلیون تومان")
* [Rob Sekke Bahar Azadi to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi-rob?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B1%D8%A8%D8%B9%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت ربع سکه بهار آزادی به میلیون تومان")
* [Sekke 1 Grami to 1m Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-gerami?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%DA%AF%D8%B1%D9%85%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه گرمی به میلیون تومان")

### Long-term and real-value charts

Any symbol can be priced in another one (e.g. a coin in USD, or USD in gold), and charts can cover any range. Add `format=svg` for a vector image.

![Emami coin in USD since 2024](https://api.priceto.day/v1/chart/usd/coin-emami?from=2024-01-01&title=Emami%20coin%20in%20USD)

* [USD in 1k Toman since 2024](https://api.priceto.day/v1/chart/irr/usd?from=2024-01-01&rounding=4&precision=1&title=USD%20in%201k%20Toman)
* [Gold miskal in USD since 2024](https://api.priceto.day/v1/chart/usd/gold-miskal?from=2024-01-01&title=Gold%20miskal%20in%20USD)
* [USD in gold miskal since 2024](https://api.priceto.day/v1/chart/gold-miskal/usd?from=2024-01-01&precision=5&title=USD%20in%20gold%20miskal)

## Hosting

The API and the website run on [Cloudflare Workers](https://workers.cloudflare.com/), with prices stored in [D1](https://developers.cloudflare.com/d1/). A Cron Trigger fetches new prices every 30 minutes during market hours.

GitHub Actions deploys the Worker. A push to `sandbox` deploys the sandbox at [pricedb-sandbox.whosane.workers.dev](https://pricedb-sandbox.whosane.workers.dev), and a merge into `main` deploys production.

## Self-hosting

You can run your own copy with a Cloudflare account; the Workers Free plan is enough for a small instance.

```bash
git clone https://github.com/margani/pricedb && cd pricedb
npm install
npx wrangler login

# Deploy the Worker. The D1 database is created on the first deploy.
cd worker && npx wrangler deploy && cd ..

# Create the tables and load the full price history from the latest public dataset
(cd worker && npx wrangler d1 migrations apply DB --remote)
node scripts/import-dataset.mjs
```

Your API is then available at `https://pricedb-api.<your-subdomain>.workers.dev/v1/...` and keeps itself up to date. Optional alerts: set the `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets (`npx wrangler secret put ...`) to get a Telegram message when updates fail.

For local development, `npx wrangler d1 migrations apply DB --local`, `node scripts/import-dataset.mjs --local` and `npx wrangler dev` (in `worker/`). Run the tests with `npm test`.
