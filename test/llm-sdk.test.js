// Runs the real Anthropic SDK against a local stub server, to check the
// request we build is what the SDK actually sends (no API key or network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { createExtractor } from '../src/lib/llm.js';

test('real SDK sends structured-output config and we parse its reply', async (t) => {
  let received;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received = { path: req.url, body: JSON.parse(body), headers: req.headers };
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '{"welcome_bonus":null}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const client = new Anthropic({
    apiKey: 'test-key',
    baseURL: `http://127.0.0.1:${server.address().port}`,
    maxRetries: 0,
  });
  const { extract } = createExtractor({ client });
  const { data } = await extract({ casinoName: 'A', url: 'https://x.test', text: 'Bonus text' });

  assert.deepEqual(data, { welcome_bonus: null });
  assert.equal(received.path, '/v1/messages');
  assert.equal(received.headers['x-api-key'], 'test-key');
  assert.equal(received.body.model, 'claude-haiku-5-5');
  assert.equal(received.body.output_config.format.type, 'json_schema');
  assert.equal(received.body.output_config.effort, 'low');
  assert.equal(received.body.tool_choice, undefined);
});
