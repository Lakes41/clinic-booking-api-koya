const { createHash } = require('node:crypto');

// Canonicalise parsed JSON so equivalent JSON with a different property order
// hashes identically, while changing any field changes the fingerprint.
function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

function hashRequestBody(body) {
  const json = JSON.stringify(stableJson(body === undefined ? null : body));
  return createHash('sha256').update(json).digest('hex');
}

// The row and the booking live in one transaction. An insert of the same key
// waits for the first transaction, then SELECT FOR UPDATE reads its outcome.
async function executeIdempotent(client, key, body, operation) {
  const requestHash = hashRequestBody(body);
  await client.query(
    `INSERT INTO idempotency_keys (idempotency_key, request_hash)
     VALUES ($1, $2)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, requestHash]
  );

  const saved = await client.query(
    `SELECT request_hash, status_code, response_body
     FROM idempotency_keys WHERE idempotency_key = $1 FOR UPDATE`,
    [key]
  );
  const record = saved.rows[0];
  if (record.request_hash !== requestHash) {
    return { status: 422, body: { error: 'Idempotency key reused with a different body' } };
  }
  if (record.status_code !== null) {
    return { status: record.status_code, body: record.response_body };
  }

  const outcome = await operation(client);
  await client.query(
    `UPDATE idempotency_keys SET status_code = $2, response_body = $3::jsonb
     WHERE idempotency_key = $1`,
    [key, outcome.status, JSON.stringify(outcome.body)]
  );
  return outcome;
}

module.exports = { stableJson, hashRequestBody, executeIdempotent };
