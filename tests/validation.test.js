const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReset, validateNewBooking, formatBooking } = require('../src/validation');

test('reset accepts a valid slot, including a date in the past', () => {
  const result = validateReset({ slots: [
    { id: 's1', provider: 'Dr Ade', start: '2020-12-10T09:00:00Z', end: '2020-12-10T09:30:00Z' }
  ] });
  assert.equal(result.slots.length, 1);
});

test('reset rejects duplicate slot ids', () => {
  const slot = { id: 's1', provider: 'Dr Ade', start: '2026-12-10T09:00:00Z', end: '2026-12-10T09:30:00Z' };
  assert.match(validateReset({ slots: [slot, slot] }).error, /Duplicate/);
});

test('reset rejects reversed times', () => {
  const result = validateReset({ slots: [
    { id: 's1', provider: 'Dr Ade', start: '2026-12-10T10:00:00Z', end: '2026-12-10T09:00:00Z' }
  ] });
  assert.ok(result.error);
});

test('bookings require a slot id, name and email', () => {
  assert.ok(validateNewBooking({ slot_id: 's1', name: 'Ada Obi' }).error);
});

test('booking names and emails are normalised', () => {
  const result = validateNewBooking({ slot_id: 's1', name: ' Ada Obi ', email: ' ADA@Example.Com ' });
  assert.deepEqual(result.data, { slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com' });
});

test('booking response has the exact expected keys', () => {
  const booking = formatBooking({
    id: 'booking-1', slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com',
    status: 'confirmed', created_at: new Date('2026-11-05T09:00:00Z')
  });
  assert.deepEqual(Object.keys(booking), ['id', 'slot_id', 'name', 'email', 'status', 'created_at']);
});
