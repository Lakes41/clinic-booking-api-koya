const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesApiKey, requireApiKey } = require('../src/auth');

test('missing and incorrect keys are rejected', () => {
  assert.equal(matchesApiKey(undefined, 'secret'), false);
  assert.equal(matchesApiKey('wrong', 'secret'), false);
  assert.equal(matchesApiKey('secret ', 'secret'), false);
  assert.equal(matchesApiKey('secret', 'secret'), true);
});

test('middleware returns 401 with JSON error for a missing key', () => {
  const original = process.env.API_KEY;
  process.env.API_KEY = 'test-secret';
  try {
    let nextCalled = false;
    let statusCode;
    let responseBody;
    const req = { get: () => undefined };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; }
    };
    requireApiKey(req, res, () => { nextCalled = true; });
    assert.equal(statusCode, 401);
    assert.equal(typeof responseBody.error, 'string');
    assert.equal(nextCalled, false);
  } finally {
    if (original === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = original;
  }
});
