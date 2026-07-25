const feedbackService = require('../services/feedbackService');
const handleError = require('../utils/handleError');

exports.listFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.listFeedback(req.query);
    res.json({ success: true, data: feedback });
  } catch (error) { handleError(error, res, next); }
};

exports.getFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.getFeedback(req.params.id);
    res.json({ success: true, data: feedback });
  } catch (error) { handleError(error, res, next); }
};

exports.logFeedback = async (req, res, next) => {
  try {
    const result = await feedbackService.logFeedback(req.body);
    res.json({ success: true, data: result });
  } catch (error) { handleError(error, res, next); }
};
