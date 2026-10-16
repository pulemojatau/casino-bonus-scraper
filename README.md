# Casino bonus scraper

Pulls the welcome-bonus terms of 3 online casinos from one public source,
turns the free-text terms into structured fields with an LLM, and publishes
them as a mobile-friendly table.

- **Live page:** https://pulemojatau.github.io/casino-bonus-scraper/
- **Data:** [`data/casinos.json`](data/casinos.json)
- **Written part (production plan):** [`docs/PRODUCTION.md`](docs/PRODUCTION.md)
- **AI notes:** [`docs/AI.md`](docs/AI.md)

## Quick start

Requires Node.js 22+ and an Anthropic API key.

```bash
git clone https://github.com/pulemojatau/casino-bonus-scraper.git && cd casino-bonus-scraper
npm install
cp .env.example .env          # then put your ANTHROPIC_API_KEY in .env

npm run scrape                # the single command: writes data/casinos.json
npm run build                 # renders dist/index.html from the JSON
```

`npm start` runs both. `npm run check` is an optional pre-flight that checks
robots.txt and fetches each page without calling the LLM, to confirm the
source is reachable from your network first. `npm test` runs the unit tests
(no network or API key needed).

## How it works

```
config/sources.json ─► robots.txt check ─► fetch page ─► page → bonus text ─► LLM ─► checks ─► data/casinos.json ─► dist/index.html
```

1. **Source.** All three casinos come from one source,
   [Gambling.com (Ireland)](https://www.gambling.com/ie/online-casinos/reviews)
   review pages. Its robots.txt allows `/ie/online-casinos/reviews/` for all
   user agents (it disallows `/go/` affiliate redirects, which we never
   follow). Pages are server-rendered HTML with prices in EUR, and there is
   no login or CAPTCHA. The config loader refuses URLs from more than one
   origin.
2. **Polite fetching** (`src/lib/http.js`, `src/lib/robots.js`). Every URL is
   checked against robots.txt first (RFC 9309 rules for missing or failing
   robots.txt, crawl-delay honoured). Requests identify the scraper in the
   User-Agent, wait 3 s between pages, time out, and retry only transient
   errors. A 401/403/429 or a CAPTCHA/challenge page stops that casino with a
   "switch source" error; nothing tries to get around it.
3. **Text extraction** (`src/lib/extract-text.js`). Boilerplate is stripped
   and only lines near bonus keywords are kept. No CSS selectors, so a site
   redesign does not silently break it, and the LLM sees a few KB instead of
   the whole page.
4. **LLM step** (`src/lib/llm.js`). Claude Haiku 5.5 with structured outputs
   (a JSON schema the API enforces) returns the welcome bonus, wagering
   multiplier, minimum deposit, a verbatim evidence snippet for each, and a
   note on any conflicts. Review pages often contradict themselves (an offer
   box saying "min deposit €20" and an older paragraph saying €10), so the
   prompt prefers the current offer box and asks for null rather than a
   guess.
5. **Checks** (`src/lib/validate.js`). The schema guarantees the shape, not the
   truth. Each evidence snippet must appear verbatim in the page text, the
   number must appear in its evidence, and values must be plausible. Anything
   that fails is kept but marked `needs_review` with the reason, and the page
   shows it. One casino failing does not stop the others.
6. **Page** (`src/lib/render.js`). Static HTML, no JavaScript. Table on
   desktop, one card per casino on phones. All scraped values are escaped,
   and only http(s) links are emitted.

## Output

```json
{
  "generated_at": "2026-10-16T08:00:00.000Z",
  "source": { "name": "Gambling.com (Ireland)", "homepage": "…" },
  "model": "claude-haiku-5-5",
  "casinos": [
    {
      "name": "…",
      "welcome_bonus": "200% up to 2500 EUR + 50 free spins",
      "wagering_requirement": 35,
      "minimum_deposit": "20 EUR",
      "source_url": "https://www.gambling.com/ie/online-casinos/reviews/…",
      "status": "ok",
      "warnings": [],
      "details": { "wagering_applies_to": "…", "evidence": { … }, "notes": null, "content_sha256": "…", "scraped_at": "…" }
    }
  ]
}
```

The four requested fields are the top-level `welcome_bonus`,
`wagering_requirement`, `minimum_deposit` and `source_url`. `status` is `ok`,
`needs_review` or `error`.

## Configuration

- `config/sources.json`: the source, the 3 casino URLs, User-Agent, delay.
  To switch source, replace the URLs (all from one site) and run
  `npm run check`.
- `.env`: `ANTHROPIC_API_KEY` (required), `LLM_MODEL` (optional, defaults to
  `claude-haiku-5-5`).

## Deploying

`.github/workflows/pages.yml` runs the tests, builds `dist/` from the
committed `data/casinos.json` and publishes it to GitHub Pages on every push
to `main`. In the repo settings, set **Pages → Source** to **GitHub
Actions**. The scrape runs locally because it needs the API key; to refresh
the page, run `npm run scrape`, commit `data/casinos.json` and push.

## Project layout

```
config/sources.json      source + casino URLs
src/cli/                 entry points: scrape, build-site, check
src/lib/                 config, robots, http, extract-text, llm, validate, pipeline, render
test/                    node:test unit tests + a synthetic fixture page
data/casinos.json        scraper output (committed)
docs/                    production plan, AI notes
```

## Known gaps

- The offers shown are those Gambling.com displays for Ireland. Run from
  another country, the site may show different or no offers.
- Review pages sometimes disagree with themselves. The model is told to
  prefer the offer box and to explain conflicts in `notes`, and the checks
  flag ungrounded values, but a person should still glance at `needs_review`
  rows.
- No scheduling, database or history: out of scope for this task, covered in
  [`docs/PRODUCTION.md`](docs/PRODUCTION.md).

## Time spent

_Fill in._
