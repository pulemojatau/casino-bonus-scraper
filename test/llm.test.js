import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExtractor, BONUS_SCHEMA, DEFAULT_MODEL } from '../src/lib/llm.js';

function fakeClient(response) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        return typeof response === 'function' ? response(params) : response;
      },
    },
  };
}

const sample = {
  welcome_bonus: '100% up to 500 EUR',
  wagering_requirement: 35,
  wagering_applies_to: 'bonus',
  minimum_deposit: { amount: 20, currency: 'EUR' },
  evidence: { welcome_bonus: '100% up to €500', wagering_requirement: '35x', minimum_deposit: 'Min deposit €20' },
  notes: null,
};

test('sends the page text with the JSON schema and parses the text block', async () => {
  const client = fakeClient({
    stop_reason: 'end_turn',
    model: DEFAULT_MODEL,
    content: [
      { type: 'thinking', thinking: '...' },
      { type: 'text', text: JSON.stringify(sample) },
    ],
    usage: { input_tokens: 900, output_tokens: 120 },
  });
  const { extract } = createExtractor({ client });

  const result = await extract({ casinoName: 'A', url: 'https://x.test/a', text: 'PAGE TEXT' });

  assert.deepEqual(result.data, sample);
  const params = client.calls[0];
  assert.equal(params.model, DEFAULT_MODEL);
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.equal(params.output_config.format.schema, BONUS_SCHEMA);
  assert.match(params.messages[0].content, /<page_text>\nPAGE TEXT\n<\/page_text>/);
});

test('throws on refusal or truncated output', async () => {
  for (const stop_reason of ['refusal', 'max_tokens']) {
    const { extract } = createExtractor({ client: fakeClient({ stop_reason, content: [] }) });
    await assert.rejects(extract({ casinoName: 'A', url: 'u', text: 't' }), /no usable output/);
  }
});

test('throws a readable error on non-JSON output', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sure! Here…' }] });
  const { extract } = createExtractor({ client });
  await assert.rejects(extract({ casinoName: 'A', url: 'u', text: 't' }), /not valid JSON/);
});

test('schema stays inside the structured-outputs subset', () => {
  // Every object must be closed and list every property as required,
  // otherwise the API rejects the request with a 400.
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${path} must set additionalProperties:false`);
      assert.deepEqual(
        [...node.required].sort(),
        Object.keys(node.properties).sort(),
        `${path} must require all properties`,
      );
    }
    for (const [key, child] of Object.entries(node)) visit(child, `${path}.${key}`);
  };
  visit(BONUS_SCHEMA, 'schema');
});
