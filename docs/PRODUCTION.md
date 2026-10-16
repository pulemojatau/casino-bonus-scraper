# Taking it to production: 200 casinos, updated daily

> Draft. Rewrite in your own words before submitting; the brief asks for that.

**Where it runs.** One Hetzner Cloud CX23 VM (2 vCPU, 4 GB) in Germany with
Docker Compose: the scraper as a one-off job container, PostgreSQL, and Caddy
serving the site. 200 pages a day is a small workload, so one VM is the
cheapest, simplest setup one person can own end to end. The scraper gets a
`sources` table, one request at a time per domain, conditional GETs, and a
content hash per page so the LLM (Haiku via the half-price Batch API) only
runs when the bonus text changed. A failed page keeps its last good value,
marked stale.

**Database and backups.** PostgreSQL 17 on an attached volume. Offers are
versioned (`valid_from`/`valid_to`) so history is kept. Nightly
`pg_dump -Fc`, encrypted, to Backblaze B2 with 30-day retention, plus
Hetzner's server backups. A monthly job restores the latest dump into a
throwaway container to prove it works.

**Domain, DNS, HTTPS.** Domain and DNS on Cloudflare, proxied for caching
and DDoS protection. Caddy issues and renews Let's Encrypt certificates
automatically; Cloudflare SSL mode "Full (strict)".

**Scheduling and failure alerts.** A systemd timer runs the job at 03:00 UTC.
It pings Healthchecks.io on start, success and failure; no success ping by
04:30 means an email or Slack alert. The job also fails on bad data, not just
crashes: over 10% of casinos erroring or needing review, or a value jumping
far from yesterday's, exits non-zero. Each run's counts and errors go into a
`scrape_runs` table, and an uptime monitor watches the site.

**Rough monthly cost.** VM with backups ≈ €7, B2 < €1, domain ≈ €1, LLM ≈
€2–5, Cloudflare and Healthchecks free: **about €10–15 a month.** The same
design on managed AWS (Fargate, RDS, CloudFront) would be roughly 3x that.
