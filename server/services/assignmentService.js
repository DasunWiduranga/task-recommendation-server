const Assignment = require('../models/Assignment');

async function listAssignments({ sprintId, developerId, taskId } = {}) {
  const query = {};
  if (sprintId)    query.sprintId    = sprintId;
  if (developerId) query.developerId = developerId;
  if (taskId)      query.taskId      = taskId;

  return Assignment.find(query)
    .populate('taskId', 'title sprintId')
    .populate('developerId', 'name email skillTags')
    .populate('sprintId', 'name')
    .sort({ createdAt: -1 });
}

async function getAssignment(id) {
  const assignment = await Assignment.findById(id)
    .populate('taskId')
    .populate('developerId', '-passwordHash')
    .populate('sprintId');

  if (!assignment) {
    const err = new Error('Assignment not found.');
    err.statusCode = 404;
    throw err;
  }

  return assignment;
}

module.exports = { listAssignments, getAssignment };
