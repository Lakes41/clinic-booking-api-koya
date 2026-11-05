const ATTEMPT_LIMIT = 5;
const WINDOW_SECONDS = 60;

// Assignable email identity for *every* booking attempt with a non-empty
// string email, even when the rest of the booking is invalid. Missing emails
// cannot be attributed to an email-specific rate bucket.
function normaliseAttemptEmail(body) {
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  return email || null;
}

// The caller must already have opened a PostgreSQL transaction. A per-email
// transaction-level advisory lock serialises attempts across ALL app instances.
// No JS/in-memory state is used; failures count when the caller commits.
async function chargeBookingAttempt(client, email) {
  if (!email) return null;

  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [email]);

  // Use a database timestamp, not each app server's local clock.
  const { rows: clock } = await client.query('SELECT clock_timestamp() AS now');
  const now = clock[0].now;
  // Prune this email's expired rows so storage does not grow with repeat use.
  await client.query(
    `DELETE FROM booking_attempts
     WHERE email = $1 AND attempted_at <= $2::timestamptz - INTERVAL '60 seconds'`,
    [email, now]
  );
  const active = await client.query(
    `SELECT attempted_at FROM booking_attempts
     WHERE email = $1 AND attempted_at > $2::timestamptz - INTERVAL '60 seconds'
     ORDER BY attempted_at ASC, id ASC
     LIMIT $3`,
    [email, now, ATTEMPT_LIMIT]
  );

  if (active.rowCount >= ATTEMPT_LIMIT) {
    const first = new Date(active.rows[0].attempted_at).getTime();
    const remainingMs = first + WINDOW_SECONDS * 1000 - new Date(now).getTime();
    return {
      status: 429,
      body: { error: 'Too many booking attempts for this email' },
      retryAfter: Math.max(1, Math.ceil(remainingMs / 1000))
    };
  }

  await client.query(
    `INSERT INTO booking_attempts (email, attempted_at) VALUES ($1, $2)`,
    [email, now]
  );
  return null;
}

module.exports = { ATTEMPT_LIMIT, WINDOW_SECONDS, normaliseAttemptEmail, chargeBookingAttempt };
