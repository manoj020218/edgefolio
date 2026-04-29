function validateBody(requiredFields = []) {
  return (req, _res, next) => {
    try {
      const missing = requiredFields.filter((field) => {
        const value = req.body?.[field];
        return value === undefined || value === null || value === '';
      });

      if (missing.length > 0) {
        const err = new Error(`Missing required fields: ${missing.join(', ')}`);
        err.statusCode = 400;
        throw err;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  validateBody,
};
