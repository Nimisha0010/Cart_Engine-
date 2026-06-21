/**
 * Centralized error handler. Normalizes Mongoose validation/cast errors and
 * duplicate-key errors into the same structured 400/409 shape used by the
 * Joi validation middleware, so API consumers get one consistent error
 * contract regardless of which layer rejected the request.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);

  if (err.name === 'ValidationError') {
    // Mongoose schema validation error
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Document failed schema validation.',
      details,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Invalid value for field "${err.path}".`,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A resource with that unique key already exists.',
      keys: err.keyValue,
    });
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.name || 'Error', message: err.message });
  }

  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong while processing the request.',
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
  });
}

module.exports = { errorHandler, notFoundHandler };
