# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-11-01 by `/impeccable init`; the owner confirmed it the same day.

## Platform

web — an installable PWA (manifest, service worker, window-controls overlay)

## Users

- People in Iran and the diaspora who check the free-market price of the dollar, euro, pound, gold and coins, often several times a day, mostly on a phone. The site is Persian-first, with an English toggle.
- Developers who embed prices in apps, sites, READMEs, spreadsheets and LLM tools through the free API, badges, CSV, RSS and the MCP server.
- Telegram users who want a daily report and threshold alerts without opening a site.

## Product Purpose

Free, no-key, no-sign-up access to Iran's free-market prices from tgju.org, updated every 30 minutes during market hours, with history since 2023-12. Success means the number is current, trustworthy and quick to read, and the API keeps working without maintenance from its users.

## Positioning

One free source behind every surface: website, dashboard, API, badges, charts as PNG/SVG, RSS, CSV dataset, Telegram bot and MCP server, all fed from the same D1 history. The dollar is cross-checked against Bitpin USDT, with an alert on a >5% gap.

## Operating Context

- Prices do not change on Fridays or after Thursday afternoon (market closed).
- Values are stored in rial; the site and bot show toman (rial ÷ 10).
- Surfaces: priceto.day (prices page), /dashboard (rotating, kiosk-style), api.priceto.day (API intro), prices.readme.io (docs).

## Capabilities and Constraints

- Runs on Cloudflare Workers + D1 with static assets; no build step, no front-end framework: plain HTML/CSS/JS in `worker/public`.
- Bilingual: Persian (RTL) and English, including mixed text on one line. Light and dark themes.
- Tehran Stock Exchange: TEDPIX (from tgju) and moving-average alerts in the bot. The equal-weight index and single stocks are on hold: TSETMC is unreachable from outside Iran (owner decision 2026-11-01, #236).
- Out of scope: auto-trading; scraping IBD, Nasdaq.com or LSE.

## Brand Commitments

- Name: "قیمت امروز" / priceto.day; bot @Price2DayBot.
- Existing icon set in `worker/public/icons`; theme colour #36a2eb.
- Vazirmatn is used for Persian text in rendered charts.

## Evidence on Hand

- Real data only: prices from tgju.org and Bitpin, usage counts at /v1/stats.
- No testimonials, user counts or press exist; do not invent any.

## Product Principles

1. The current number comes first and must be readable at a glance.
2. Free and open: no key, no sign-up, no tracking beyond daily-salted counts.
3. Persian-first, never Persian-only.
4. Honest freshness: show when a price was last updated and when the market is closed.

## Accessibility & Inclusion

No formal standard recorded. Pages already support RTL/LTR switching and light/dark themes; no formal standard is set.
