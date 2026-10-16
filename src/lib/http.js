/**
 * Polite HTTP fetching. We identify ourselves, time out, retry only on
 * transient errors, and stop (rather than work around) when a site blocks
 * us: the brief says not to bypass logins, CAPTCHAs or blocks.
 */

export class BlockedError extends Error {
  constructor(url, detail) {
    super(
      `Blocked by source (${detail}) at ${url}. Not bypassing it: ` +
        'switch to another source in config/sources.json.',
    );
    this.name = 'BlockedError';
    this.url = url;
  }
}

export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
  }
}

// Markers of bot challenges / CAPTCHA interstitials. If we see one, we stop.
const CHALLENGE_MARKERS = [
  /<title>\s*just a moment/i,
  /cf-chl-|challenge-platform/i,
  /attention required!?\s*\|\s*cloudflare/i,
  /g-recaptcha|h-captcha|hcaptcha\.com|captcha-delivery\.com/i,
  /<title>\s*access denied/i,
];

export function looksLikeChallenge(html) {
  return CHALLENGE_MARKERS.some((re) => re.test(html));
}

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchPage(
  url,
  { userAgent, timeoutMs = 20000, retries = 2, fetchImpl = fetch, sleep = sleepDefault } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Network error for ${url}: ${err.message}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new BlockedError(url, `HTTP ${res.status}`);
    }

    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt < retries) {
      await sleep(retryAfterMs(res) ?? backoffMs(attempt));
      continue;
    }
    if (res.status === 429) throw new BlockedError(url, 'HTTP 429 rate limited');
    if (!res.ok) throw new HttpError(url, res.status);

    const html = await res.text();
    if (looksLikeChallenge(html)) throw new BlockedError(url, 'bot challenge / CAPTCHA page');
    return { html, finalUrl: res.url || url };
  }
}

function backoffMs(attempt) {
  return 1000 * 2 ** attempt;
}

function retryAfterMs(res) {
  const value = res.headers?.get?.('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds, 60) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.min(date - Date.now(), 60000));
}
