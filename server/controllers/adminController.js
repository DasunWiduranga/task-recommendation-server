const adminService = require('../services/adminService');
const handleError = require('../utils/handleError');

exports.getStats = async (req, res, next) => {
  try {
    const data = await adminService.getStats();
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

exports.getModelStatus = async (req, res, next) => {
  try {
    const data = await adminService.getModelStatus();
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

exports.retrain = async (req, res, next) => {
  try {
    const data = await adminService.retrainModel(req.user?._id || null);
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};
