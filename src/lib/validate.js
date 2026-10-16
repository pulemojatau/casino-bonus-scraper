/**
 * Checks on what the LLM returned. The schema guarantees the *shape*; these
 * checks are about whether the *values* are plausible and actually come from
 * the page. Anything doubtful is kept but flagged, so a person can review it
 * instead of a wrong number being published silently.
 */

const WORD_NUMBERS = {
  ten: 10, fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30, 'thirty-five': 35,
  forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
};

export function normalize(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/(\d),(\d{3})\b/g, '$1$2') // 2,500 -> 2500
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Is `snippet` present in `text`, ignoring case, spacing and typography? */
export function isGrounded(snippet, text) {
  if (!snippet) return false;
  return normalize(text).includes(normalize(snippet));
}

/** Does `text` mention the number `n`, as digits or as a common word? */
export function mentionsNumber(text, n) {
  const t = normalize(text);
  const digits = String(n);
  if (new RegExp(`(^|[^\\d.])${digits.replace('.', '\\.')}(?![\\d])`).test(t)) return true;
  const word = Object.keys(WORD_NUMBERS).find((w) => WORD_NUMBERS[w] === n);
  return Boolean(word && new RegExp(`\\b${word.replace('-', '[- ]')}\\b`).test(t));
}

function numbersIn(text) {
  return (normalize(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/**
 * @param {object} data   structured output from the LLM
 * @param {string} text   the page text that was sent to the LLM
 */
export function validateExtraction(data, text) {
  const warnings = [];
  const evidence = data.evidence ?? {};

  // Welcome bonus
  let welcomeBonus = typeof data.welcome_bonus === 'string' ? data.welcome_bonus.trim() : null;
  if (!welcomeBonus) {
    welcomeBonus = null;
    warnings.push('No welcome bonus found on the page.');
  } else {
    if (!isGrounded(evidence.welcome_bonus, text)) {
      warnings.push('Welcome bonus evidence was not found verbatim on the page.');
    }
    const missing = numbersIn(welcomeBonus).filter((n) => !mentionsNumber(text, n));
    if (missing.length) {
      warnings.push(`Welcome bonus mentions ${missing.join(', ')}, which is not on the page.`);
    }
  }

  // Wagering requirement
  let wagering = data.wagering_requirement;
  if (wagering !== null && !(Number.isFinite(wagering) && wagering > 0 && wagering <= 200)) {
    warnings.push(`Wagering requirement ${wagering} is implausible; dropped.`);
    wagering = null;
  }
  if (wagering !== null) {
    if (!isGrounded(evidence.wagering_requirement, text)) {
      warnings.push('Wagering evidence was not found verbatim on the page.');
    } else if (!mentionsNumber(evidence.wagering_requirement, wagering)) {
      warnings.push(`Wagering evidence does not contain ${wagering}.`);
    }
  }

  // Minimum deposit
  let minimumDeposit = null;
  const md = data.minimum_deposit;
  if (md) {
    const currency = String(md.currency ?? '').trim().toUpperCase();
    if (!(Number.isFinite(md.amount) && md.amount > 0 && md.amount <= 10000) || !/^[A-Z]{3}$/.test(currency)) {
      warnings.push(`Minimum deposit ${JSON.stringify(md)} is implausible; dropped.`);
    } else {
      minimumDeposit = { amount: md.amount, currency };
      if (!isGrounded(evidence.minimum_deposit, text)) {
        warnings.push('Minimum deposit evidence was not found verbatim on the page.');
      } else if (!mentionsNumber(evidence.minimum_deposit, md.amount)) {
        warnings.push(`Minimum deposit evidence does not contain ${md.amount}.`);
      }
    }
  }

  return {
    welcome_bonus: welcomeBonus,
    wagering_requirement: wagering,
    minimum_deposit: minimumDeposit ? `${minimumDeposit.amount} ${minimumDeposit.currency}` : null,
    details: {
      wagering_applies_to: data.wagering_applies_to ?? 'not_stated',
      minimum_deposit: minimumDeposit,
      notes: data.notes ?? null,
      evidence,
    },
    warnings,
  };
}
