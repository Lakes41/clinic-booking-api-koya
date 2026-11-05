import assert from 'node:assert/strict';

const base = process.env.API_URL || 'http://localhost:3000';
async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
const end = new Date(start.getTime() + 30 * 60 * 1000);
const slot = {
  id: 'level1-smoke-slot', provider: 'Dr Ade',
  start: start.toISOString(), end: end.toISOString()
};

const reset = await request('/reset', { method: 'POST', body: { slots: [slot] } });
assert.equal(reset.status, 200, JSON.stringify(reset));
const listed = await request('/slots');
assert.equal(listed.status, 200);
assert.equal(listed.data.slots[0].id, slot.id);
assert.equal(listed.data.slots[0].available, true);
const created = await request('/bookings', {
  method: 'POST', body: { slot_id: slot.id, name: ' Ada Obi ', email: ' ADA@Example.Com ' }
});
assert.equal(created.status, 201, JSON.stringify(created));
assert.equal(created.data.status, 'confirmed');
assert.equal(created.data.email, 'ada@example.com');
const retrieved = await request(`/bookings/${created.data.id}`);
assert.equal(retrieved.status, 200);
assert.deepEqual(retrieved.data, created.data);
const repeated = await request('/bookings', {
  method: 'POST', body: { slot_id: slot.id, name: 'Another Patient', email: 'another@example.com' }
});
assert.equal(repeated.status, 409);
const after = await request('/slots');
assert.equal(after.data.slots[0].available, false);
console.log('Level 1 smoke test passed: reset, list, book, look up, prevent double booking.');
