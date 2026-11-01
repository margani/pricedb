# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-11-01 by `/impeccable init` without the owner interview (the owner was not available overnight).
> Facts marked **(repo)** come from README.md, CLAUDE.md and the shipped pages. Facts marked **(inferred)** are assumptions to confirm or correct.

## Platform

web — an installable PWA (manifest, service worker, window-controls overlay) **(repo)**

## Users

- People in Iran and the diaspora who check the free-market price of the dollar, euro, pound, gold and coins, often several times a day, mostly on a phone **(inferred: the phone-first part)**. The site is Persian-first, with an English toggle **(repo)**.
- Developers who embed prices in apps, sites, READMEs, spreadsheets and LLM tools through the free API, badges, CSV, RSS and the MCP server **(repo)**.
- Telegram users who want a daily report and threshold alerts without opening a site **(repo)**.

## Product Purpose

Free, no-key, no-sign-up access to Iran's free-market prices from tgju.org, updated every 30 minutes during market hours, with history since 2023-12 **(repo)**. Success means the number is current, trustworthy and quick to read, and the API keeps working without maintenance from its users **(inferred)**.

## Positioning

One free source behind every surface: website, dashboard, API, badges, charts as PNG/SVG, RSS, CSV dataset, Telegram bot and MCP server, all fed from the same D1 history. The dollar is cross-checked against Bitpin USDT, with an alert on a >5% gap **(repo)**.

## Operating Context

- Prices do not change on Fridays or after Thursday afternoon (market closed) **(repo)**.
- Values are stored in rial; the site and bot show toman (rial ÷ 10) **(repo)**.
- Surfaces: priceto.day (prices page), /dashboard (rotating, kiosk-style), api.priceto.day (API intro), prices.readme.io (docs) **(repo)**.

## Capabilities and Constraints

- Runs on Cloudflare Workers + D1 with static assets; no build step, no front-end framework: plain HTML/CSS/JS in `worker/public` **(repo)**.
- Bilingual: Persian (RTL) and English, including mixed text on one line **(repo)**. Light and dark themes **(repo)**.
- Planned: Tehran Stock Exchange index and about 30 liquid symbols, and indicator alerts (moving-average crosses, volume) in the bot **(repo: owner decision 2026-11-01)**.
- Out of scope: auto-trading; scraping IBD, Nasdaq.com or LSE **(owner decision 2026-11-01)**.

## Brand Commitments

- Name: "قیمت امروز" / priceto.day; bot @Price2DayBot **(repo)**.
- Existing icon set in `worker/public/icons`; theme colour #36a2eb **(repo)**.
- Vazirmatn is used for Persian text in rendered charts **(repo)**.

## Evidence on Hand

- Real data only: prices from tgju.org and Bitpin, usage counts at /v1/stats **(repo)**.
- No testimonials, user counts or press exist; do not invent any **(inferred)**.

## Product Principles

1. The current number comes first and must be readable at a glance **(inferred)**.
2. Free and open: no key, no sign-up, no tracking beyond daily-salted counts **(repo)**.
3. Persian-first, never Persian-only **(inferred from the default language and the English toggle)**.
4. Honest freshness: show when a price was last updated and when the market is closed **(inferred)**.

## Accessibility & Inclusion

No formal standard recorded. Pages already support RTL/LTR switching and light/dark themes **(repo)**; the target standard is open for the owner to decide **(inferred)**.
