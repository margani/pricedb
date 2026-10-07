# pricedb — Claude Code instructions

## Project
- Purpose: free API, website, Telegram bot and MCP server for free-market
  prices in Iran (USD, EUR, GBP, gold, coins) from tgju.org, at
  https://api.priceto.day (docs: https://prices.readme.io).
- Stack: Cloudflare Workers (`worker/`) + D1 (price history, alerts) +
  Workers Static Assets (landing page in `worker/public`) + Cron Triggers
  (updates every 30 minutes) + resvg-wasm (PNG charts). Runs on the owner's
  personal Cloudflare account (Workers Paid plan).
- Legacy, being retired (#120, #136): the GitHub Actions PowerShell updater
  (`src/`, `.github/workflows/update.yml`) that commits JSON to `tgju/`, the
  daily `squash-history` force-push, and the Netlify functions (`netlify/`).

## Commands
- Install: `npm install` (Node 24+: the tests need the global `URLPattern`)
- Build: none; wrangler bundles on deploy. Check the bundle with
  `cd worker && npx wrangler deploy --env production --dry-run --outdir /tmp/wb`
- Test: `npm test`
- Lint: `npm run lint:openapi` (Redocly + every route in `worker/src/index.js`
  must be documented in `openapi.yaml`)
- Local dev: `cd worker && npx wrangler dev`
  - First time: `npx wrangler d1 migrations apply DB --local` and
    `node scripts/import-dataset.mjs --local` (loads the public dataset)
  - Test crons: add `--test-scheduled`, then
    `curl "http://localhost:8787/__scheduled?cron=*/30+4-22+*+*+*"`
  - Test Telegram without a real bot: run a fake server and pass
    `--var TELEGRAM_API_URL:http://127.0.0.1:9999 --var TELEGRAM_BOT_TOKEN:test`
  - The Worker's Cache API persists locally: delete
    `worker/.wrangler/state/v3/cache` when a response looks stale.

## GitHub workflow
- For every feature, bug, or problem, create a GitHub issue first.
- Create a branch and a PR that references the issue. When the work is
  done, tests pass, and the visual check is clean, merge the PR yourself.
- This keeps a full history of what was done and why.
- Owner tasks (when to hand off: see the global `~/.claude/CLAUDE.md`):
  issue assigned to `margani`, labelled `needs-owner`.
- Group related work under an `epic` issue with sub-issues so progress is
  visible; milestones: Phase 1–3 and Features.

## Visual testing
- For UI changes (landing page, charts, badges), run `wrangler dev` first,
  then open the LOCAL url it prints (e.g. http://localhost:8787) with
  Playwright and screenshot it, at desktop and phone widths.
- Also check Persian (RTL) text rendering. Generic visual-check rules and
  owner-issue accuracy: see the global `~/.claude/CLAUDE.md`.
- Do not test visually against production or the remote sandbox in dev.

## Versioning & deploy
- Keep a visible version number. The deployed build must show its version
  (#135: `/v1/version` and the landing page footer). Bump it on every
  production release.
- Branch model:
  - `main` -> deploys to PRODUCTION.
  - `sandbox` -> deploys to the SANDBOX environment.
- Feature/bug work: branch from `sandbox`, open a PR into `sandbox`,
  merge there once tests + visual check pass. Collect changes in sandbox.
- The owner tests the full sandbox environment. When they're happy with all
  fixes together, open ONE PR from `sandbox` into `main`, listing every
  bug/feature included and bumping the version.
- Merging that PR releases a clean, versioned production deploy with all
  fixes at once. NEVER push straight to `main` or deploy production
  without that PR.
- Until #136 is decided, the nightly `squash-history` workflow rewrites
  `main`, which breaks `sandbox` → `main` PRs; don't rely on that release
  path before it's resolved.

## Environments
- Local dev: `cd worker && npx wrangler dev` (local D1 copy, never remote)
- Sandbox deploy: not set up yet (#134); will be
  `cd worker && npx wrangler deploy --env sandbox` (pricedb-sandbox on workers.dev)
- Production deploy: `cd worker && npx wrangler deploy --env production`
  (https://api.priceto.day); D1 migrations:
  `npx wrangler d1 migrations apply DB --remote --env production`
- A plain `npx wrangler deploy` (no `--env`) deploys a separate self-hosted
  Worker `pricedb-api`, never production.
- NEVER deploy to production unless the owner explicitly says so.

## Data safety
- Local/sandbox must use the TEST database, never production data.
  `wrangler dev` uses a local D1 copy; never add `--remote` against the
  production database while developing.
- The production D1 database (`pricedb`) holds the only copy of prices
  since 2026-10-03; the monthly `dataset-*` release is the long-term
  backup. Never drop or rewrite its tables.

## Gotchas
- The Cloudflare WAF custom rule "By UAs" blocks User-Agents containing
  `python` or `node` (#131 for `/mcp`).
- Wallex blocks requests from Cloudflare Workers (403); the second price
  source is Bitpin.
- Stop local `workerd` processes by PID; `pkill -f`/`fuser` patterns can
  match your own shell.

## Open tasks
- Owner decisions and setup: issues labeled `needs-owner`
  (`gh issue list -R margani/pricedb -l needs-owner`).
- Sandbox environment (#134), version number (#135), retire the legacy
  GitHub Actions/Netlify setup (#120, #136).
