const taskService = require('../services/taskService');
const handleError = require('../utils/handleError');

// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res, next) => {
  try {
    const task = await taskService.createTask(req.body, req.user._id);
    res.status(201).json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/tasks/:id
// @access  Private
exports.getTask = async (req, res, next) => {
  try {
    const task = await taskService.getTask(req.params.id, req.user._id);
    res.json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res, next) => {
  try {
    const tasks = await taskService.getTasks(req.query, req.user._id);
    res.json({ success: true, data: tasks });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res, next) => {
  try {
    const task = await taskService.updateTask(req.params.id, req.body, req.user._id);
    res.json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res, next) => {
  try {
    await taskService.deleteTask(req.params.id, req.user._id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/tasks/:id/assign
// @access  Private
exports.assignTask = async (req, res, next) => {
  try {
    const task = await taskService.assignTask(req.params.id, req.body.assigneeId, req.user._id);
    res.json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/tasks/:id/status
// @access  Private
exports.updateTaskStatus = async (req, res, next) => {
  try {
    const task = await taskService.updateTaskStatus(req.params.id, req.body.status, req.user._id);
    res.json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/tasks/:id/comments
// @access  Private
exports.addComment = async (req, res, next) => {
  try {
    const task = await taskService.addComment(req.params.id, req.body.text, req.user._id);
    res.status(201).json({ success: true, data: task });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/tasks/:id/comments
// @access  Private
exports.getComments = async (req, res, next) => {
  try {
    const comments = await taskService.getComments(req.params.id, req.user._id);
    res.json({ success: true, data: comments });
  } catch (error) { handleError(error, res, next); }
};
