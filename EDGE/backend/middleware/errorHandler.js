function notFoundHandler(_req, _res, next) {
  const err = new Error('Endpoint not found');
  err.statusCode = 404;
  next(err);
}

function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    error: err.message || 'Unexpected server error',
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
