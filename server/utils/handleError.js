module.exports = function handleError(error, res, next) {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  next(error);
};
