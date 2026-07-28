const axios = require('axios');
const Assignment = require('../models/Assignment');
const Feedback = require('../models/Feedback');
const { ML, FEEDBACK } = require('../constants');

async function listFeedback({ sprintId, developerId, taskId } = {}) {
  const query = {};
  if (sprintId)    query.sprintId    = sprintId;
  if (developerId) query.developerId = developerId;
  if (taskId)      query.taskId      = taskId;

  return Feedback.find(query)
    .populate('assignmentId')
    .populate('taskId', 'title')
    .populate('developerId', 'name email')
    .populate('sprintId', 'name')
    .sort({ createdAt: -1 });
}

async function getFeedback(id) {
  const feedback = await Feedback.findById(id)
    .populate('assignmentId')
    .populate('taskId')
    .populate('developerId', '-passwordHash')
    .populate('sprintId');

  if (!feedback) {
    const err = new Error('Feedback not found.');
    err.statusCode = 404;
    throw err;
  }

  return feedback;
}

async function logFeedback({ taskId, developerId, action, assignmentId }) {
  if (!action || !FEEDBACK.ACTIONS.includes(action)) {
    const err = new Error('action must be "accept" or "reject".');
    err.statusCode = 400;
    throw err;
  }

  let assignment;

  if (assignmentId) {
    assignment = await Assignment.findByIdAndUpdate(
      assignmentId,
      { accepted: action === 'accept' },
      { new: true }
    );
    if (!assignment) {
      const err = new Error('Assignment not found.');
      err.statusCode = 404;
      throw err;
    }
  } else if (taskId && developerId) {
    // The assign endpoint usually creates the Assignment just before this call.
    // Update that record rather than inserting a duplicate, which would
    // double-count the acceptance in CF training.
    assignment = await Assignment.findOneAndUpdate(
      { taskId, developerId },
      { accepted: action === 'accept' },
      { new: true, sort: { createdAt: -1 } }
    );
    if (!assignment) {
      assignment = new Assignment({ taskId, developerId, accepted: action === 'accept' });
      await assignment.save();
    }
  } else {
    const err = new Error('Provide assignmentId or both taskId and developerId.');
    err.statusCode = 400;
    throw err;
  }

  const feedback = new Feedback({
    assignmentId: assignment._id,
    action,
    taskId:      assignment.taskId,
    developerId: assignment.developerId,
    sprintId:    assignment.sprintId || null,
  });
  await feedback.save();

  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  try {
    const mlResponse = await axios.post(
      `${mlServiceUrl}/feedback`,
      { taskId: assignment.taskId.toString(), developerId: assignment.developerId.toString(), action },
      { timeout: ML.TIMEOUT_FEEDBACK }
    );

    return {
      feedback,
      retrained:   mlResponse.data.retrained   ?? true,
      newAccuracy: mlResponse.data.newAccuracy ?? null,
    };
  } catch (mlError) {
    console.warn('ML feedback endpoint unavailable:', mlError.message);
    return { feedback, retrained: false, message: 'Feedback logged. ML retraining deferred.' };
  }
}

module.exports = { listFeedback, getFeedback, logFeedback };
