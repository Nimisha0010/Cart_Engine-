const rateLimit = require('express-rate-limit');

/**
 * Basic IP-based rate limiter applied globally. Protects the service from
 * abusive ingestion/checkout loops. Window and max are environment
 * configurable so this can be tuned per deployment without a code change.
 */
const apiLimiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please slow down and try again shortly.',
  },
});

module.exports = apiLimiter;
