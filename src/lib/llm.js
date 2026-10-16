import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-haiku-5-5';

const nullable = (type, description) => ({ type: [type, 'null'], description });

/**
 * JSON Schema for the structured output. Written to the structured-outputs
 * subset (every object closed with additionalProperties:false, every key
 * required, nulls for "not stated") so the API guarantees the shape and we
 * only have to check the *content*.
 */
export const BONUS_SCHEMA = {
  type: 'object',
  properties: {
    welcome_bonus: nullable(
      'string',
      'Current headline welcome offer, normalised like "100% up to 500 EUR + 50 free spins". ' +
        'ISO currency codes. Keep the numbers exactly as the page states them.',
    ),
    wagering_requirement: nullable(
      'number',
      'Wagering multiplier for the welcome bonus as a number: 35 for "35x" or "thirty-five times".',
    ),
    wagering_applies_to: {
      type: 'string',
      enum: ['bonus', 'deposit_and_bonus', 'free_spin_winnings', 'not_stated'],
      description: 'What the wagering multiplier is applied to, if the text says.',
    },
    minimum_deposit: {
      anyOf: [
        {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string', description: 'ISO 4217 code, e.g. EUR' },
          },
          required: ['amount', 'currency'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
      description: 'Minimum deposit needed to qualify for the welcome bonus.',
    },
    evidence: {
      type: 'object',
      description: 'For each field, the shortest snippet copied character-for-character from the text.',
      properties: {
        welcome_bonus: nullable('string'),
        wagering_requirement: nullable('string'),
        minimum_deposit: nullable('string'),
      },
      required: ['welcome_bonus', 'wagering_requirement', 'minimum_deposit'],
      additionalProperties: false,
    },
    notes: nullable('string', 'One sentence on conflicts or ambiguities in the page, else null.'),
  },
  required: [
    'welcome_bonus',
    'wagering_requirement',
    'wagering_applies_to',
    'minimum_deposit',
    'evidence',
    'notes',
  ],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `You extract online-casino welcome-bonus terms from the text of a review page.

Rules:
- Use only the text you are given. Never fill gaps from general knowledge; if a value is not stated, return null.
- Review pages often contradict themselves. Prefer the current offer box and its T&Cs summary (usually near the top) over older editorial paragraphs, and mention the conflict in "notes".
- minimum_deposit is the minimum needed to qualify for the welcome bonus. If the page only gives a general site minimum, use it and say so in "notes".
- wagering_requirement is the multiplier only (35 for "35x"). If it only applies to free-spin winnings, still return it and set wagering_applies_to accordingly.
- Evidence snippets must be copied exactly from the text (same characters, symbols and spelling), not paraphrased. They are checked automatically.`;

/**
 * Wraps the Anthropic client. `client` is injectable so tests can run
 * without a network or an API key.
 */
export function createExtractor({ apiKey, model = DEFAULT_MODEL, client } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 });

  async function extract({ casinoName, url, text }) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: BONUS_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content:
            `Casino: ${casinoName}\nPage: ${url}\n\n` +
            `<page_text>\n${text}\n</page_text>\n\n` +
            'Extract the welcome bonus terms.',
        },
      ],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      throw new Error(`LLM returned no usable output (stop_reason=${response.stop_reason})`);
    }
    const block = response.content.find((b) => b.type === 'text');
    if (!block) throw new Error('LLM response had no text block');

    let data;
    try {
      data = JSON.parse(block.text);
    } catch {
      throw new Error(`LLM output was not valid JSON: ${block.text.slice(0, 200)}`);
    }
    return { data, model: response.model ?? model, usage: response.usage };
  }

  return { extract, model };
}
