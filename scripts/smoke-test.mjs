import assert from 'node:assert/strict';
import 'dotenv/config';

const base = process.env.API_URL || 'http://localhost:3000';
const key = process.env.API_KEY;
if (!key) throw new Error('Set API_KEY in .env before running the smoke test');

async function request(path, { method = 'GET', body, apiKey = key } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (apiKey !== null) headers['X-API-Key'] = apiKey;
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
console.log('Levels 1–3 smoke test passed: API key, validation, bookings, cancellation, rebooking and 12 concurrent booking requests (1 created, 11 conflicts).');
