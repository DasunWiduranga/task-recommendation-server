const recommendationService = require('../services/recommendationService');
const handleError = require('../utils/handleError');

// @route   GET /api/recommend/:taskId
// @route   POST /api/recommendations/task/:taskId  (legacy)
// @access  Private
exports.getRecommendation = async (req, res, next) => {
  try {
    const taskId = req.params.taskId || req.params.id;
    const data = await recommendationService.getRecommendation(taskId, req.user._id);
    return res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/recommendations/accept
// @access  Private
exports.acceptRecommendation = async (req, res, next) => {
  try {
    const task = await recommendationService.acceptRecommendation(req.body);
    return res.json({ success: true, message: 'Developer assigned successfully', data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/recommendations/reject
// @access  Private
exports.rejectRecommendation = async (req, res, next) => {
  try {
    const task = await recommendationService.rejectRecommendation(req.body);
    return res.json({ success: true, message: 'Manual assignment completed', data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/feedback  (unified feedback endpoint)
// @access  Private
exports.logFeedback = async (req, res, next) => {
  try {
    const feedback = await recommendationService.logFeedback(req.body);
    return res.json({ success: true, data: { feedback } });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/recommendations/task/:taskId
// @access  Private
exports.getRecommendationByTask = async (req, res, next) => {
  try {
    const recommendation = await recommendationService.getRecommendationByTask(req.params.taskId);
    return res.json({ success: true, data: recommendation || null });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/recommendations
// @access  Private
exports.getRecommendations = async (req, res, next) => {
  try {
    const recommendations = await recommendationService.getRecommendations(req.query);
    return res.json({ success: true, data: recommendations });
  } catch (error) { handleError(error, res, next); }
};
