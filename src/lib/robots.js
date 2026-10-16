import robotsParser from 'robots-parser';

/**
 * robots.txt checker with a per-origin cache.
 *
 * Status handling follows RFC 9309 section 2.3.1:
 *  - 2xx: parse and obey the rules
 *  - 4xx: robots.txt is "unavailable", crawling is allowed
 *  - 5xx / network error: "unreachable", assume everything is disallowed
 */
export function createRobotsChecker({ userAgent, fetchImpl = fetch, timeoutMs = 10000 }) {
  const cache = new Map();

  async function load(origin) {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await fetchImpl(robotsUrl, {
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        return { kind: 'parsed', robots: robotsParser(robotsUrl, await res.text()) };
      }
      if (res.status >= 400 && res.status < 500) return { kind: 'allow-all' };
      return { kind: 'disallow-all', reason: `robots.txt returned HTTP ${res.status}` };
    } catch (err) {
      return { kind: 'disallow-all', reason: `robots.txt unreachable: ${err.message}` };
    }
  }

  async function rulesFor(origin) {
    if (!cache.has(origin)) cache.set(origin, load(origin));
    return cache.get(origin);
  }

  /**
   * @returns {Promise<{allowed: boolean, crawlDelayMs: number, reason?: string}>}
   */
  async function check(url) {
    const { origin } = new URL(url);
    const rules = await rulesFor(origin);

    if (rules.kind === 'allow-all') return { allowed: true, crawlDelayMs: 0 };
    if (rules.kind === 'disallow-all') {
      return { allowed: false, crawlDelayMs: 0, reason: rules.reason };
    }

    const allowed = rules.robots.isAllowed(url, userAgent) !== false;
    const delaySeconds = Number(rules.robots.getCrawlDelay(userAgent)) || 0;
    return {
      allowed,
      crawlDelayMs: delaySeconds * 1000,
      ...(allowed ? {} : { reason: 'disallowed by robots.txt' }),
    };
  }

  return { check };
}
