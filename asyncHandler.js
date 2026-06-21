/**
 * Wraps an async Express handler so rejected promises are forwarded to
 * next(err) automatically, instead of needing try/catch in every controller.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
