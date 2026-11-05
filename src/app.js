const express = require('express');
const path = require('path');
const { randomUUID } = require('node:crypto');
const pool = require('./db');
const { requireApiKey } = require('./auth');
const { validateReset, validateNewBooking, formatBooking } = require('./validation');

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Check the API key before parsing JSON. Every API request without a valid key gets 401.
app.use(['/reset', '/slots', '/bookings'], requireApiKey);
app.use(express.json({ limit: '1mb' }));

// Helper: forward database errors into the JSON error handler.
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Level 1: replace ALL slots, deleting previous bookings too.
app.post('/reset', asyncRoute(async (req, res) => {
  const result = validateReset(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM slots');
    for (const slot of result.slots) {
      await client.query(
        'INSERT INTO slots (id, provider, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [slot.id, slot.provider, slot.start, slot.end]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return res.status(200).json({ success: true });
}));

// Level 1: return EVERY slot, earliest start first, with availability.
app.get('/slots', asyncRoute(async (req, res) => {
  const provider = typeof req.query.provider === 'string' ? req.query.provider : null;
  const result = await pool.query(
    `SELECT s.id, s.provider, s.start_time, s.end_time,
            NOT EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.slot_id = s.id AND b.status = 'confirmed'
            ) AS available
     FROM slots s
     WHERE ($1::text IS NULL OR s.provider = $1)
     ORDER BY s.start_time ASC, s.id ASC`,
    [provider]
  );
  const slots = result.rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    start: new Date(row.start_time).toISOString(),
    end: new Date(row.end_time).toISOString(),
    available: row.available
  }));
  return res.status(200).json({ slots });
}));

// Level 1: book a slot. Unique database index prevents double booking.
app.post('/bookings', asyncRoute(async (req, res) => {
  const result = validateNewBooking(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  const { slot_id, name, email } = result.data;
  const slotResult = await pool.query(
    'SELECT id, start_time FROM slots WHERE id = $1', [slot_id]
  );
  if (slotResult.rowCount === 0) {
    return res.status(404).json({ error: 'Slot not found' });
  }
  if (new Date(slotResult.rows[0].start_time).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Slot has already started' });
  }

  try {
    const created = await pool.query(
      `INSERT INTO bookings (id, slot_id, name, email, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       RETURNING id, slot_id, name, email, status, created_at`,
      [randomUUID(), slot_id, name, email]
    );
    return res.status(201).json(formatBooking(created.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Slot already booked' });
    }
    if (error.code === '23503') {
      return res.status(404).json({ error: 'Slot not found' });
    }
    throw error;
  }
}));

// Level 3: cancel a confirmed booking atomically. The partial unique index
// on bookings(slot_id) allows a new confirmed booking once this commits.
app.delete('/bookings/:id', asyncRoute(async (req, res) => {
  const cancelled = await pool.query(
    `UPDATE bookings
     SET status = 'cancelled'
     WHERE id = $1 AND status = 'confirmed'
     RETURNING id, slot_id, name, email, status, created_at`,
    [req.params.id]
  );

  if (cancelled.rowCount > 0) {
    return res.status(200).json(formatBooking(cancelled.rows[0]));
  }

  // If two cancellation requests arrive together, only one UPDATE succeeds.
  const existing = await pool.query(
    'SELECT status FROM bookings WHERE id = $1',
    [req.params.id]
  );
  if (existing.rowCount === 0) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  return res.status(409).json({ error: 'Booking already cancelled' });
}));

// Level 1: get a booking by its ID.
app.get('/bookings/:id', asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, slot_id, name, email, status, created_at
     FROM bookings WHERE id = $1`,
    [req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  return res.status(200).json(formatBooking(result.rows[0]));
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
