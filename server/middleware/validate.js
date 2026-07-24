const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    message: errors.array().map(e => e.msg).join(', '),
    errors: errors.array(),
  });
}

module.exports = validate;
