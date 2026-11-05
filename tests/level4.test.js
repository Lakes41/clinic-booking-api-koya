const test = require('node:test');
const assert = require('node:assert/strict');
const { hashRequestBody } = require('../src/idempotency');
const { makeCursor, readCursor, parseBookingsQuery } = require('../src/pagination');

test('Idempotency fingerprints ignore JSON property order', () => {
  const first = { slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com' };
  const reordered = { email: 'ada@example.com', name: 'Ada Obi', slot_id: 's1' };
  assert.equal(hashRequestBody(first), hashRequestBody(reordered));
});

test('Idempotency fingerprints detect changed request bodies', () => {
  const first = { slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com' };
  const changed = { ...first, slot_id: 's2' };
  assert.notEqual(hashRequestBody(first), hashRequestBody(changed));
});

test('Pagination defaults to 10 and matches email case insensitively', () => {
  assert.deepEqual(parseBookingsQuery({ email: ' Ada@Example.Com ' }), {
    email: 'ada@example.com', limit: 10, cursor: null
  });
});

test('Pagination rejects missing email and invalid limits', () => {
  for (const bad of [undefined, '', 'not-email']) {
    assert.ok(parseBookingsQuery({ email: bad }).error);
  }
  for (const bad of ['0', '51', '-1', '2.1', 'abc', '01']) {
    assert.ok(parseBookingsQuery({ email: 'ada@example.com', limit: bad }).error);
  }
  assert.equal(parseBookingsQuery({ email: 'ada@example.com', limit: '50' }).limit, 50);
});

test('A cursor round-trips a precise timestamp and booking ID', () => {
  const email = 'ada@example.com';
  const original = {
    email, cursor_time: '2026-11-05T09:34:14.247381Z', id: 'abc-123'
  };
  const encoded = makeCursor(original);
  assert.deepEqual(readCursor(encoded, email), {
    time: original.cursor_time, id: original.id
  });
  assert.ok(parseBookingsQuery({ email, cursor: encoded }).cursor);
  assert.ok(parseBookingsQuery({ email: 'someone@example.com', cursor: encoded }).error);
});

test('Malformed cursors return a validation error', () => {
  for (const cursor of ['x', '!@#', '', 'bm90LWpzb24', 'eyJ2IjoxfQ']) {
    assert.ok(parseBookingsQuery({ email: 'ada@example.com', cursor }).error);
  }
});
