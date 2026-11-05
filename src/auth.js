const { timingSafeEqual } = require('node:crypto');

function matchesApiKey(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected) {
    return false;
  }
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireApiKey(req, res, next) {
  if (!matchesApiKey(req.get('X-API-Key'), process.env.API_KEY)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  return next();
}

module.exports = { matchesApiKey, requireApiKey };
