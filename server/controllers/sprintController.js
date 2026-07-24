const sprintService = require('../services/sprintService');
const handleError = require('../utils/handleError');

// @route   POST /api/sprints
// @access  Private (admin, scrum_master)
exports.createSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.createSprint(req.body);
    return res.status(201).json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/sprints/:id
// @access  Private
exports.getSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.getSprint(req.params.id, req.user._id);
    return res.json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/sprints
// @access  Private
exports.getSprints = async (req, res, next) => {
  try {
    const sprints = await sprintService.getSprints(req.query, req.user._id);
    return res.json({ success: true, data: sprints });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/sprints/:id/status
// @access  Private
exports.updateSprintStatus = async (req, res, next) => {
  try {
    const sprint = await sprintService.updateSprintStatus(req.params.id, req.body.status);
    return res.json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/sprints/:id
// @access  Private
exports.updateSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.updateSprint(req.params.id, req.body);
    return res.json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   DELETE /api/sprints/:id
// @access  Private (admin, scrum_master)
exports.deleteSprint = async (req, res, next) => {
  try {
    await sprintService.deleteSprint(req.params.id, req.query.deleteTasks === 'true');
    return res.json({ success: true, message: 'Sprint deleted successfully.' });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/sprints/:id/clone
// @access  Private (admin, scrum_master)
exports.cloneSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.cloneSprint(req.params.id, req.body.name);
    return res.status(201).json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/sprints/:id/start
// @access  Private (admin, scrum_master)
exports.startSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.startSprint(req.params.id);
    return res.json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/sprints/:id/complete
// @access  Private (admin, scrum_master)
exports.completeSprint = async (req, res, next) => {
  try {
    const sprint = await sprintService.completeSprint(req.params.id);
    return res.json({ success: true, data: sprint });
  } catch (error) { handleError(error, res, next); }
};
