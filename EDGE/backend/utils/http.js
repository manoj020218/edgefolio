function sendOk(res, data, meta = {}) {
  res.json({
    ok: true,
    data,
    meta,
  });
}

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  sendOk,
  createHttpError,
};
