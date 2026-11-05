const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateReset(body) {
  if (!body || !Array.isArray(body.slots)) {
    return { error: 'slots must be an array' };
  }

  const seenIds = new Set();
  const slots = [];

  for (const item of body.slots) {
    if (!item || !isNonEmptyString(item.id) || !isNonEmptyString(item.provider)) {
      return { error: 'Each slot needs an id and provider' };
    }
    if (seenIds.has(item.id)) {
      return { error: 'Duplicate slot id' };
    }
    seenIds.add(item.id);
    if (typeof item.start !== 'string' || typeof item.end !== 'string' ||
        !isoWithZone.test(item.start) || !isoWithZone.test(item.end)) {
      return { error: 'Slot start and end must be ISO 8601 timestamps with a timezone' };
    }
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      return { error: 'Each slot must have valid dates and end after start' };
    }
    slots.push({ id: item.id, provider: item.provider, start, end });
  }
  return { slots };
}

function validateNewBooking(body) {
  if (!body || !isNonEmptyString(body.slot_id) ||
      !isNonEmptyString(body.name) || !isNonEmptyString(body.email)) {
    return { error: 'slot_id, name and email are required' };
  }
  const email = body.email.trim().toLowerCase();
  if (!emailPattern.test(email)) {
    return { error: 'Invalid email address' };
  }
  return {
    data: { slot_id: body.slot_id, name: body.name.trim(), email }
  };
}

function formatBooking(row) {
  return {
    id: row.id,
    slot_id: row.slot_id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: new Date(row.created_at).toISOString()
  };
}

module.exports = { validateReset, validateNewBooking, formatBooking };
