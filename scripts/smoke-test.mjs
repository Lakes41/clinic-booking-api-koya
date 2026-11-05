import assert from 'node:assert/strict';
import 'dotenv/config';

const base = process.env.API_URL || 'http://localhost:3000';
const key = process.env.API_KEY;
if (!key) throw new Error('Set API_KEY in .env before running the smoke test');

async function request(path, { method = 'GET', body, apiKey = key, idempotencyKey } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (apiKey !== null) headers['X-API-Key'] = apiKey;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

// IMPORTANT: this test replaces all slots and deletes every existing booking.
const noKey = await request('/slots', { apiKey: null });
assert.equal(noKey.status, 401, JSON.stringify(noKey));
const incorrectKey = await request('/slots', { apiKey: 'an-incorrect-key' });
assert.equal(incorrectKey.status, 401, JSON.stringify(incorrectKey));

const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);
const pastStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
const slots = [
  { id: 'smoke-future-slot', provider: 'Dr Ade', start: futureStart.toISOString(), end: futureEnd.toISOString() },
  { id: 'smoke-past-slot', provider: 'Dr Ade', start: pastStart.toISOString(), end: pastEnd.toISOString() }
];
const reset = await request('/reset', { method: 'POST', body: { slots } });
assert.equal(reset.status, 200, JSON.stringify(reset));
const listed = await request('/slots');
assert.equal(listed.status, 200);
assert.deepEqual(listed.data.slots.map(s => s.id), ['smoke-past-slot', 'smoke-future-slot']);
assert.equal(listed.data.slots[1].available, true);

const missingName = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-future-slot', email: 'ada@example.com' }
});
assert.equal(missingName.status, 400);
const badEmail = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-future-slot', name: 'Ada Obi', email: 'not-an-email' }
});
assert.equal(badEmail.status, 400);
const unknownSlot = await request('/bookings', {
  method: 'POST', body: { slot_id: 'unknown-slot', name: 'Ada Obi', email: 'ada@example.com' }
});
assert.equal(unknownSlot.status, 404);
const pastSlot = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-past-slot', name: 'Ada Obi', email: 'ada@example.com' }
});
assert.equal(pastSlot.status, 400);

const created = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-future-slot', name: ' Ada Obi ', email: ' ADA@Example.Com ' }
});
assert.equal(created.status, 201, JSON.stringify(created));
assert.equal(created.data.status, 'confirmed');
assert.equal(created.data.email, 'ada@example.com');
assert.equal(created.data.name, 'Ada Obi');
const retrieved = await request(`/bookings/${created.data.id}`);
assert.equal(retrieved.status, 200);
assert.deepEqual(retrieved.data, created.data);
const repeated = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-future-slot', name: 'Another Patient', email: 'another@example.com' }
});
assert.equal(repeated.status, 409);
const after = await request('/slots');
assert.equal(after.data.slots[1].available, false);
// Level 3: cancel a booking, verify the state and freed slot, then rebook it.
const cancelled = await request(`/bookings/${created.data.id}`, { method: 'DELETE' });
assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
assert.equal(cancelled.data.status, 'cancelled');
assert.equal(cancelled.data.id, created.data.id);
assert.equal(cancelled.data.created_at, created.data.created_at);
const cancelledLookup = await request(`/bookings/${created.data.id}`);
assert.equal(cancelledLookup.status, 200);
assert.deepEqual(cancelledLookup.data, cancelled.data);
const duplicateCancel = await request(`/bookings/${created.data.id}`, { method: 'DELETE' });
assert.equal(duplicateCancel.status, 409, JSON.stringify(duplicateCancel));
const missingCancel = await request('/bookings/no-such-booking', { method: 'DELETE' });
assert.equal(missingCancel.status, 404);
const afterCancellation = await request('/slots');
assert.equal(afterCancellation.data.slots[1].available, true);
const rebook = await request('/bookings', {
  method: 'POST', body: { slot_id: 'smoke-future-slot', name: 'Rebooking Patient', email: 'again@example.com' }
});
assert.equal(rebook.status, 201, JSON.stringify(rebook));
assert.notEqual(rebook.data.id, created.data.id);

// Level 3: race multiple distinct patients for one free slot.
// The partial unique PostgreSQL index, not JavaScript memory, must enforce this.
const raceSlot = {
  id: 'smoke-concurrent-slot', provider: 'Dr Tests',
  start: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString()
};
const raceReset = await request('/reset', {
  method: 'POST', body: { slots: [raceSlot] }
});
assert.equal(raceReset.status, 200, JSON.stringify(raceReset));
const attempts = Array.from({ length: 12 }, (_, i) => request('/bookings', {
  method: 'POST',
  body: { slot_id: raceSlot.id, name: `Patient ${i}`, email: `race${i}@example.com` }
}));
const results = await Promise.all(attempts);
const successful = results.filter(r => r.status === 201);
const conflicts = results.filter(r => r.status === 409);
assert.equal(successful.length, 1, JSON.stringify(results));
assert.equal(conflicts.length, 11, JSON.stringify(results));
const raceAvailability = await request('/slots');
assert.equal(raceAvailability.data.slots[0].available, false);
// Level 4: idempotency must replay even after the booking has been cancelled.
const idempotencySlot = {
  id: 'smoke-idempotency-slot', provider: 'Dr Replay',
  start: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() + 97 * 60 * 60 * 1000).toISOString()
};
await request('/reset', { method: 'POST', body: { slots: [idempotencySlot] } });
const idempotencyBody = {
  slot_id: idempotencySlot.id, name: 'Ada Obi', email: 'Ada@Example.com'
};
const firstKey = 'smoke-level4-key-one';
const first = await request('/bookings', {
  method: 'POST', body: idempotencyBody, idempotencyKey: firstKey
});
assert.equal(first.status, 201, JSON.stringify(first));
const replay = await request('/bookings', {
  method: 'POST', body: { email: 'Ada@Example.com', name: 'Ada Obi', slot_id: idempotencySlot.id },
  idempotencyKey: firstKey
});
assert.equal(replay.status, 201, JSON.stringify(replay));
assert.deepEqual(replay.data, first.data);
const changed = await request('/bookings', {
  method: 'POST', body: { ...idempotencyBody, name: 'Different Name' }, idempotencyKey: firstKey
});
assert.equal(changed.status, 422, JSON.stringify(changed));
assert.equal(typeof changed.data.error, 'string');
await request(`/bookings/${first.data.id}`, { method: 'DELETE' });
const replayAfterCancel = await request('/bookings', {
  method: 'POST', body: idempotencyBody, idempotencyKey: firstKey
});
assert.equal(replayAfterCancel.status, 201);
assert.deepEqual(replayAfterCancel.data, first.data);

// Many simultaneous retries using the SAME key all receive one response.
await request('/reset', { method: 'POST', body: { slots: [idempotencySlot] } });
const concurrentRetries = await Promise.all(Array.from({ length: 8 }, () =>
  request('/bookings', {
    method: 'POST', body: idempotencyBody,
    idempotencyKey: 'smoke-level4-concurrent-key'
  })
));
assert.ok(concurrentRetries.every((item) => item.status === 201), JSON.stringify(concurrentRetries));
assert.ok(concurrentRetries.every((item) => item.data.id === concurrentRetries[0].data.id));

// Even failures are replayed for the same key and body.
const missingBody = { slot_id: 'not-a-slot', name: 'Ada', email: 'ada@example.com' };
const missingFirst = await request('/bookings', {
  method: 'POST', body: missingBody, idempotencyKey: 'smoke-level4-error-key'
});
const missingReplay = await request('/bookings', {
  method: 'POST', body: missingBody, idempotencyKey: 'smoke-level4-error-key'
});
assert.equal(missingFirst.status, 404);
assert.deepEqual(missingReplay, missingFirst);

// Level 4: seed bookings for one person, plus a different person's booking.
// Verify that pages do not overlap or omit any booking, and include cancelled bookings.
const pagingSlots = Array.from({ length: 7 }, (_, i) => ({
  id: `smoke-page-slot-${i}`,
  provider: 'Dr Page',
  start: new Date(Date.now() + (120 + i) * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() + (121 + i) * 60 * 60 * 1000).toISOString()
}));
await request('/reset', { method: 'POST', body: { slots: pagingSlots } });
const pagingCreated = [];
for (let i = 0; i < 6; i++) {
  const response = await request('/bookings', {
    method: 'POST',
    body: {
      slot_id: pagingSlots[i].id, name: `Page Patient ${i}`,
      email: i === 5 ? 'other@example.com' : 'PAGE@Example.com'
    }
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  pagingCreated.push(response.data);
}
const cancelledPageBooking = await request(`/bookings/${pagingCreated[1].id}`, { method: 'DELETE' });
assert.equal(cancelledPageBooking.status, 200);
const allPaged = [];
let cursor = null;
let pages = 0;
do {
  const query = new URLSearchParams({ email: 'page@EXAMPLE.com', limit: '2' });
  if (cursor) query.set('cursor', cursor);
  const page = await request(`/bookings?${query}`);
  assert.equal(page.status, 200, JSON.stringify(page));
  assert.ok(Array.isArray(page.data.bookings));
  assert.ok(page.data.bookings.length <= 2);
  allPaged.push(...page.data.bookings);
  cursor = page.data.next_cursor;
  pages++;
  assert.ok(pages < 10, 'Cursor pagination loop did not end');
} while (cursor !== null);
assert.equal(allPaged.length, 5);
assert.equal(new Set(allPaged.map((b) => b.id)).size, 5);
assert.deepEqual(new Set(allPaged.map((b) => b.id)), new Set(pagingCreated.slice(0, 5).map((b) => b.id)));
assert.equal(allPaged.find((b) => b.id === pagingCreated[1].id).status, 'cancelled');
for (let i = 1; i < allPaged.length; i++) {
  const previous = allPaged[i - 1];
  const current = allPaged[i];
  assert.ok(previous.created_at < current.created_at ||
    (previous.created_at === current.created_at && previous.id < current.id));
}
const defaultLimit = await request('/bookings?email=page@example.com');
assert.equal(defaultLimit.status, 200);
assert.equal(defaultLimit.data.next_cursor, null);
const invalidLimit = await request('/bookings?email=page@example.com&limit=51');
assert.equal(invalidLimit.status, 400);
const invalidCursor = await request('/bookings?email=page@example.com&cursor=not-a-cursor');
assert.equal(invalidCursor.status, 400);

console.log('Levels 1–4 smoke test passed: authentication, validation, booking, cancellation, concurrency (1/12), idempotent replay, same-key concurrency (8/8), and cursor pagination.');
