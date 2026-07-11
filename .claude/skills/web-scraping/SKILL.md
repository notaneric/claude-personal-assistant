---
name: web-scraping
description: >
  Use whenever a task needs a real web browser or web data: opening a site,
  logging in, searching, clicking through results, monitoring a page daily, or
  scraping listings (jobs, products, leads). Makes the assistant DRIVE the browser
  itself instead of telling the user to navigate, and escalates from live driving to
  a durable script when a site needs to be scanned repeatedly. Triggers: "open",
  "go to", "scan", "scrape", "monitor this site", "check every day", "pull the
  listings", "log in and search", "find jobs/products/leads", any recurring web task.
---

# Web scraping and browser driving (do it yourself; escalate to a durable script)

Two rules first, then the tier ladder.

## Rule 1: Never hand navigation back to the user

You have a real browser (the Playwright MCP tools, `mcp__playwright__*`). When a task
touches a website, **you** open, click, type, scroll, and read. You never ask the user to
click, navigate, log in, search, or copy. If you catch yourself writing "please click…" or
"navigate to…", stop. That means you either lost your browser tools (say so; run `/mcp` to
check the server is connected) or you should be driving them yourself.

## Rule 2: Only stop for a genuine block

Keep going and make reasonable assumptions. Stop and ask the user only when:
1. A login, 2FA, or a "Verify you are human" / CAPTCHA challenge blocks you and only a
   human can clear it, or
2. You would submit, pay for, message, or delete something irreversible.

Never turn a slow page, a missing button, or a layout change into a to-do list for the
user. Recover on your own (retry, scroll, re-find the element, adjust the selector).

## Setup note (Windows, macOS, Linux)

Tier 1 needs the Playwright MCP, wired via this repo's committed `.mcp.json` (bare `npx`);
that works on macOS/Linux and most Windows setups. **Windows:** if the browser tools never
appear and `/mcp` shows the server failing with `spawn npx ENOENT`, edit `.mcp.json` to the
`cmd /c npx` form noted in that file. Tiers 2 and 3 use plain `node`/`npm` and the
`claude mcp add` CLI, identical on every OS; script paths are relative (`./profile`,
`./output`) so they work everywhere.

## The three-tier ladder

Pick the lowest tier that meets the need. Escalate only when it stops being enough.

### Tier 1: Live driving (Playwright MCP), for prototyping, watching, one-offs
Best for: a one-time task, or figuring out the exact flow/selectors on a new site while the
user watches a visible window.
- `browser_navigate` → `browser_snapshot` (structured accessibility tree; more reliable than
  screenshots) → `browser_click` / `browser_type` / `browser_fill_form`.
- Headed (visible) is the default; do not add `--headless`. Persistent profile is the
  default, so a one-time login survives; ask the user to log in **once** in the window, then
  continue on your own.
- Weakness: it runs only while you're actively driving it, has no retry/persistence, and on a
  bot-protected site (Cloudflare/Turnstile) an unattended run stalls on a challenge. So use it
  to **prototype and verify the flow**, then, for anything recurring, bake that flow into a
  Tier-2 script.

### Tier 2: Durable script (Crawlee), the default for recurring/daily scans
Best for: "scan this every day". A reusable script you write once and run unattended.
Crawlee wraps the **same** Playwright engine but adds anti-blocking (human-like fingerprints
ON by default, a session pool, retries) and writes structured output to disk you can inspect.

Set up once (Node 18+):
```
npm install crawlee playwright && npx playwright install chromium
# package.json needs  "type": "module"  (or name the file *.mjs)
```
Minimal headful, logged-in-persistent PlaywrightCrawler:
```js
import { PlaywrightCrawler, Dataset } from 'crawlee';
const crawler = new PlaywrightCrawler({
  launchContext: {
    userDataDir: './profile',            // one-time login persists across runs
    launchOptions: { headless: false },  // visible window the user can watch
  },
  maxConcurrency: 1,                     // human-paced; don't hammer the site
  requestHandler: async ({ page, request, log }) => {
    await page.waitForLoadState('domcontentloaded');
    // ...select the cards/rows and Dataset.pushData({...})...
  },
});
await crawler.run(['https://example.com/search?q=...']);
```
Your workflow: **write the `.mjs`, run it (`node scan.mjs`) from any shell (macOS/Linux
Terminal, Windows PowerShell or cmd), read the JSON it writes to `./storage/datasets/` and
`./output/`, and iterate on failures.** When selectors return nothing, drop back to Tier 1
(drive the live site with Playwright MCP) to find the current selectors, then update the
script. Have the script save the page HTML plus a screenshot when it captures 0 rows, so a
break is diagnosable instead of silent.
- Fingerprinting reduces but does not guarantee getting past Cloudflare. For heavier targets
  you add a residential proxy list (`new ProxyConfiguration({ proxyUrls: [...] })`), which is a
  paid, bring-your-own dependency. Keep volume low and pacing human before reaching for it.

### Tier 3: Managed scraper (Apify Actor), only if Tier 2 keeps getting blocked
Best for: a non-technical owner who needs reliability and will accept a paid cloud service.
A maintained Actor runs headless browsers plus rotating residential proxies plus maintained
selectors on Apify's servers, so blocking and DOM churn are absorbed for you and you just call
a tool. Trade-offs: it costs money (roughly free-tier to ~$29/mo at small volume), and the
scraped data transits a third-party cloud, a real consideration if any personal data is
involved. Wire it only when the user opts in:
```
claude mcp add --transport http apify "https://mcp.apify.com/?tools=misceres/indeed-scraper" --header "Authorization: Bearer ${APIFY_TOKEN}"
```
(`APIFY_TOKEN` lives in the gitignored `.env`, never in committed config. Then call the Actor
as a tool and read back structured JSON.)

## Honest limits (always surface these)

- **Terms of service.** Many sites (Indeed, LinkedIn, etc.) restrict automated access in their
  ToS. Public, logged-out data is the defensible case; scraping behind a login (especially
  personal data like resumes/profiles) is against accepted terms, risks the account, and
  carries privacy-law exposure. Say this plainly; don't let "the tool handles it" read as
  "this is allowed."
- **A daily unattended scan is a watch-and-occasionally-help tool, not a silent robot.** Bot
  checks appear intermittently; design for a human to clear the rare CAPTCHA rather than
  promising a run that never needs anyone.
- **Someone maintains it.** When a site changes its HTML, a Tier-2 script breaks and you (the
  assistant, re-invoked) repatch it; a Tier-3 Actor is the author's job to maintain. A
  non-technical owner's realistic "maintenance plan" is "paste the error to my assistant".
