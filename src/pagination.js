const { Buffer } = require('node:buffer');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRECISE_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function makeCursor({ email, cursor_time, id }) {
  return Buffer.from(JSON.stringify({ v: 1, email, time: cursor_time, id }))
    .toString('base64url');
}

function readCursor(value, email) {
  if (typeof value !== 'string' || value.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (parsed.v !== 1 || parsed.email !== email ||
        typeof parsed.id !== 'string' || !parsed.id ||
        typeof parsed.time !== 'string' ||
        !PRECISE_UTC_TIMESTAMP.test(parsed.time) ||
        !Number.isFinite(Date.parse(parsed.time))) {
      return null;
    }
    return { time: parsed.time, id: parsed.id };
  } catch {
    return null;
  }
}

function parseBookingsQuery(query) {
  if (typeof query.email !== 'string' || !EMAIL_PATTERN.test(query.email.trim())) {
    return { error: 'Valid email is required' };
  }
  const email = query.email.trim().toLowerCase();
  let limit = 10;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^[1-9]\d*$/.test(query.limit) ||
        Number(query.limit) > 50) {
      return { error: 'limit must be an integer from 1 to 50' };
    }
    limit = Number(query.limit);
  }
  let cursor = null;
  if (query.cursor !== undefined) {
    cursor = readCursor(query.cursor, email);
    if (!cursor) return { error: 'Invalid cursor' };
  }
  return { email, limit, cursor };
}

module.exports = { makeCursor, readCursor, parseBookingsQuery };
