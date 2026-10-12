const buckets = new Map();

function rateLimit(name, fallbackLimit, windowMs) {
  return function limit(req, res, next) {
    const envName = `SURVEY_RATE_${name}`;
    const max = Number(process.env[envName] || fallbackLimit);
    const key = `${name}:${req.ip || 'unknown'}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) bucket = { start: now, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many requests. Please wait a moment and try again.'
      });
    }
    return next();
  };
}

function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
