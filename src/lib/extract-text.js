import * as cheerio from 'cheerio';

// Elements that never carry bonus terms (or hide them from readers).
const REMOVE = [
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas',
  'nav', 'footer', 'form', '[role="navigation"]', '[aria-hidden="true"]', '[hidden]',
].join(',');

const BLOCK = [
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol', 'p',
  'pre', 'section', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'ul', 'details', 'summary',
].join(',');

const BREAK = '\u0001';

// A line is "relevant" if it mentions anything a bonus term is made of.
const RELEVANT = new RegExp(
  [
    'bonus', 'wager', 'playthrough', 'rollover', 'turnover', 'deposit', 'free\\s?spins?',
    'welcome', 'match', 'T\\s?&\\s?Cs?', 'terms', '\\b\\d+\\s?x\\b', '\\btimes\\b',
    '€', '£', '\\$', '\\bEUR\\b', '\\bGBP\\b', '\\bUSD\\b',
  ].join('|'),
  'i',
);

/**
 * Turn an HTML page into readable lines of text: boilerplate removed,
 * block elements on their own line, table rows kept on one line so that
 * "Min deposit | €20" stays together.
 */
export function htmlToLines(html) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().trim();

  $(REMOVE).remove();
  // Mark structural breaks with a non-whitespace sentinel, so that line
  // breaks inside the HTML source (mid-sentence) can be collapsed safely.
  $('br').replaceWith(BREAK);
  $('td, th').append(' | ');
  $(BLOCK).each((_, el) => {
    $(el).prepend(BREAK).append(BREAK);
  });

  const seen = new Set();
  const lines = [];
  for (const raw of $('body').text().replace(/\s+/g, ' ').split(BREAK)) {
    const line = raw.replace(/(\s*\|\s*)+$/, '').trim();
    if (!line || seen.has(line)) continue; // drop blanks and repeated nav/teaser lines
    seen.add(line);
    lines.push(line);
  }
  return { title, lines };
}

/**
 * Keep only the lines around bonus-related keywords. This cuts the text we
 * send to the LLM (cost, and fewer distractions) without relying on the
 * page's CSS classes, which change without notice.
 */
export function focusBonusText(lines, { window = 2, maxChars = 15000 } = {}) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (!RELEVANT.test(line)) return;
    for (let j = Math.max(0, i - window); j <= Math.min(lines.length - 1, i + window); j += 1) {
      keep[j] = true;
    }
  });

  const out = [];
  let length = 0;
  let previousKept = -2;
  for (let i = 0; i < lines.length; i += 1) {
    if (!keep[i]) continue;
    const piece = (previousKept === i - 1 ? '' : out.length ? '…\n' : '') + lines[i];
    if (length + piece.length + 1 > maxChars) break;
    out.push(piece);
    length += piece.length + 1;
    previousKept = i;
  }
  return out.join('\n');
}

export function extractBonusText(html, options) {
  const { title, lines } = htmlToLines(html);
  return { title, text: focusBonusText(lines, options) };
}
