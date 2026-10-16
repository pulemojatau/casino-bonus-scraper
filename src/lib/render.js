/**
 * Render the scraped data as one static, dependency-free HTML page.
 * Every value comes from a third-party page via an LLM, so all of it is
 * escaped and only http(s) links are emitted.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const APPLIES_TO = {
  bonus: 'bonus',
  deposit_and_bonus: 'deposit + bonus',
  free_spin_winnings: 'free-spin winnings',
};

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

// Content is wrapped in one <div> so that, in the phone layout where each
// cell is a two-column grid (label | value), notes and badges stay in the
// value column instead of becoming extra grid items.
function cell(label, content, { colspan } = {}) {
  return `<td data-label="${esc(label)}"${colspan ? ` colspan="${colspan}"` : ''}><div>${content}</div></td>`;
}

const dash = '<span class="muted">Not stated</span>';

function renderRow(casino) {
  const href = safeHref(casino.source_url);
  const source = href
    ? `<a href="${esc(href)}" rel="nofollow noopener" target="_blank">${esc(new URL(href).hostname.replace(/^www\./, ''))}</a>`
    : esc(casino.source_url);

  if (casino.status === 'error') {
    return `<tr class="row-error">
      ${cell('Casino', `<strong>${esc(casino.name)}</strong>`)}
      ${cell('Welcome bonus', `<span class="muted">Could not scrape: ${esc(casino.error)}</span>`, { colspan: 3 })}
      ${cell('Source', source)}
    </tr>`;
  }

  const appliesTo = APPLIES_TO[casino.details?.wagering_applies_to];
  const wagering =
    casino.wagering_requirement != null
      ? `${esc(casino.wagering_requirement)}×${appliesTo ? ` <span class="muted">${esc(appliesTo)}</span>` : ''}`
      : dash;

  const review = casino.warnings?.length
    ? `<details class="review"><summary>Check (${casino.warnings.length})</summary><ul>${casino.warnings
        .map((w) => `<li>${esc(w)}</li>`)
        .join('')}</ul></details>`
    : '';
  const note = casino.details?.notes ? `<p class="note">${esc(casino.details.notes)}</p>` : '';

  return `<tr>
      ${cell('Casino', `<strong>${esc(casino.name)}</strong>${review}`)}
      ${cell('Welcome bonus', `${casino.welcome_bonus ? esc(casino.welcome_bonus) : dash}${note}`)}
      ${cell('Wagering', wagering)}
      ${cell('Min. deposit', casino.minimum_deposit ? esc(casino.minimum_deposit) : dash)}
      ${cell('Source', source)}
    </tr>`;
}

export function renderPage(data) {
  const casinos = data.casinos ?? [];
  const sourceName = data.source?.name ?? 'one public source';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Casino welcome bonuses</title>
<style>
  :root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --line: #e7e5e4; --card: #fff; --accent: #0f766e; --warn: #b45309; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --line: #44403c; --card: #292524; --accent: #5eead4; --warn: #fbbf24; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .meta, .muted, footer { color: var(--muted); }
  .meta { margin: 0 0 20px; font-size: .95rem; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; vertical-align: top; padding: 12px; border-bottom: 1px solid var(--line); }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  a { color: var(--accent); }
  .note { margin: 6px 0 0; font-size: .85rem; color: var(--muted); }
  .review { margin-top: 6px; font-size: .85rem; color: var(--warn); }
  .review summary { cursor: pointer; }
  .review ul { margin: 6px 0 0; padding-left: 18px; }
  footer { margin-top: 20px; font-size: .85rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  @media (max-width: 640px) {
    table, tbody, tr, td { display: block; width: 100%; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table { border: 0; background: none; }
    tr { background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 12px; padding: 4px 0; }
    td { display: grid; grid-template-columns: 7.5rem 1fr; gap: 8px; border: 0; padding: 6px 14px; }
    td::before { content: attr(data-label); font-size: .8rem; color: var(--muted); padding-top: 2px; }
  }
</style>
</head>
<body>
<main>
  <h1>Casino welcome bonuses</h1>
  <p class="meta">${casinos.length} casinos from ${esc(sourceName)} · updated ${esc(formatDate(data.generated_at))}</p>
  <table>
    <caption class="sr-only">Welcome bonus, wagering requirement and minimum deposit per casino</caption>
    <thead><tr><th scope="col">Casino</th><th scope="col">Welcome bonus</th><th scope="col">Wagering</th><th scope="col">Min. deposit</th><th scope="col">Source</th></tr></thead>
    <tbody>
    ${casinos.map(renderRow).join('\n    ')}
    </tbody>
  </table>
  <footer>
    <p>Terms were extracted automatically from the linked pages${data.model ? ` with ${esc(data.model)}` : ''} and checked against the page text. Bonus terms change often; check the casino's own T&amp;Cs before you play. <a href="casinos.json">Raw JSON</a>.</p>
    <p>18+ only. Please gamble responsibly.</p>
  </footer>
</main>
</body>
</html>
`;
}
