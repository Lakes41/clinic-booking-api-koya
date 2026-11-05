const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ATTEMPT_LIMIT, WINDOW_SECONDS,
  normaliseAttemptEmail, chargeBookingAttempt
} = require('../src/rate-limit');

function stubClient({ now, active = [] }) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
      if (sql.includes('clock_timestamp() AS now')) return { rows: [{ now }] };
      if (sql.includes('SELECT attempted_at FROM booking_attempts')) {
        return { rows: active.map(attempted_at => ({ attempted_at })), rowCount: active.length };
      }
      if (sql.includes('DELETE FROM booking_attempts')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO booking_attempts')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

test('The limit is five attempts per 60-second rolling window', () => {
  assert.equal(ATTEMPT_LIMIT, 5);
  assert.equal(WINDOW_SECONDS, 60);
});

test('Attempt identities are trimmed and case insensitive', () => {
  assert.equal(normaliseAttemptEmail({ email: '  Ada@Example.COM  ' }), 'ada@example.com');
  assert.equal(normaliseAttemptEmail({ email: 'not-an-email' }), 'not-an-email');
  assert.equal(normaliseAttemptEmail({ email: '   ' }), null);
  assert.equal(normaliseAttemptEmail({}), null);
  assert.equal(normaliseAttemptEmail(null), null);
});

test('A missing email cannot consume a per-email bucket', async () => {
  const db = stubClient({ now: new Date() });
  assert.equal(await chargeBookingAttempt(db, null), null);
  assert.equal(db.queries.length, 0);
});

test('Fewer than five recent attempts are allowed and charged', async () => {
  const db = stubClient({
    now: new Date('2026-11-05T12:00:30.000Z'),
    active: Array.from({ length: 4 }, (_, i) => new Date(`2026-11-05T12:00:0${i}.000Z`))
  });
  assert.equal(await chargeBookingAttempt(db, 'ada@example.com'), null);
  assert.equal(db.queries.filter(x => x.sql.includes('INSERT INTO booking_attempts')).length, 1);
  assert.deepEqual(db.queries[0].params, ['ada@example.com']);
});

test('The sixth attempt is 429 and has a positive whole-second Retry-After', async () => {
  const db = stubClient({
    now: new Date('2026-11-05T12:00:40.450Z'),
    active: Array.from({ length: 5 }, (_, i) => new Date(`2026-11-05T12:00:0${i}.000Z`))
  });
  const outcome = await chargeBookingAttempt(db, 'ada@example.com');
  assert.equal(outcome.status, 429);
  assert.deepEqual(Object.keys(outcome.body), ['error']);
  assert.equal(outcome.retryAfter, 20);
  assert.equal(db.queries.filter(x => x.sql.includes('INSERT INTO booking_attempts')).length, 0);
});

test('Retry-After rounds upwards to at least one second', async () => {
  const db = stubClient({
    now: new Date('2026-11-05T12:00:59.900Z'),
    active: Array.from({ length: 5 }, () => new Date('2026-11-05T12:00:00.000Z'))
  });
  assert.equal((await chargeBookingAttempt(db, 'ada@example.com')).retryAfter, 1);
});
