const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const Assignment = require('../models/Assignment');
const { getAccessibleTeamIds } = require('../utils/access');
const { TASK } = require('../constants');

// Keeps the CF training ground-truth (Assignment records) in sync when a task
// changes hands. A reassignment is real-world evidence the previous match did
// not stick, so the old developer's accepted record is flipped to rejected and
// the new developer gets (or keeps) exactly one accepted record. The Feedback
// collection is deliberately left alone: it is an immutable audit of how the
// user responded to a recommendation at the time.
async function recordAssignmentChange(taskId, sprintId, prevAssigneeId, nextAssigneeId) {
  const prev = prevAssigneeId ? prevAssigneeId.toString() : null;
  const next = nextAssigneeId ? nextAssigneeId.toString() : null;
  if (prev === next) return;

  if (prev) {
    await Assignment.updateMany(
      { taskId, developerId: prev, accepted: true },
      { accepted: false }
    );
  }

  if (next) {
    await Assignment.findOneAndUpdate(
      { taskId, developerId: next },
      { accepted: true, sprintId },
      { upsert: true, new: true, sort: { createdAt: -1 } }
    );
  }
}

async function assertSprintMutable(sprintId) {
  const sprint = await Sprint.findById(sprintId).select('status teamId');
  if (sprint && sprint.status === 'COMPLETED') {
    const err = new Error('This task belongs to a completed sprint and is read-only.');
    err.statusCode = 400;
    throw err;
  }
  return sprint;
}

async function createTask({ title, description, status, priority, storyPoints, sprintId, assigneeId, type, componentLabels }, userId) {
  if (!title || !sprintId || !description) {
    const err = new Error('Title, Sprint ID and description are required');
    err.statusCode = 400;
    throw err;
  }

  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    const err = new Error('Sprint not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(sprint.teamId.toString())) {
    const err = new Error('Sprint not found');
    err.statusCode = 404;
    throw err;
  }

  const task = await Task.create({
    title,
    description,
    type:            type || TASK.DEFAULT_TYPE,
    status:          status || TASK.DEFAULT_STATUS,
    priority:        priority?.toUpperCase() || TASK.DEFAULT_PRIORITY,
    storyPoints:     storyPoints || TASK.DEFAULT_STORY_POINTS,
    componentLabels: componentLabels || [],
    sprintId,
    teamId:          sprint.teamId,
    assigneeId:      assigneeId || null,
    reporterId:      userId,
  });

  return Task.findById(task._id)
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');
}

async function getTask(taskId, userId) {
  const task = await Task.findById(taskId)
    .populate('sprintId')
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(task.sprintId.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  return task;
}

async function getTasks({ sprintId } = {}, userId) {
  const accessibleTeamIds = await getAccessibleTeamIds(userId);

  let filter = {};
  if (sprintId) {
    const sprint = await Sprint.findById(sprintId).select('teamId');
    if (!sprint || !accessibleTeamIds.includes(sprint.teamId.toString())) {
      return [];
    }
    filter = { sprintId };
  } else {
    const accessibleSprints = await Sprint.find({ teamId: { $in: accessibleTeamIds } }).select('_id');
    filter = { sprintId: { $in: accessibleSprints.map(s => s._id) } };
  }

  return Task.find(filter)
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash')
    .populate('sprintId', 'name')
    .sort({ createdAt: -1 });
}

async function updateTask(taskId, updates, userId) {
  const allowedUpdates = ['title', 'description', 'status', 'priority', 'storyPoints', 'assigneeId'];
  const sanitized = {};
  allowedUpdates.forEach(field => {
    if (updates[field] !== undefined) sanitized[field] = updates[field];
  });

  // Priority is stored uppercase, same normalisation createTask applies.
  if (sanitized.priority) sanitized.priority = String(sanitized.priority).toUpperCase();

  const existing = await Task.findById(taskId).select('sprintId assigneeId');
  if (!existing) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  const taskSprint = await Sprint.findById(existing.sprintId).select('teamId status');
  if (!taskSprint || !accessibleTeamIds.includes(taskSprint.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  if (taskSprint.status === 'COMPLETED') {
    const err = new Error('This task belongs to a completed sprint and is read-only.');
    err.statusCode = 400;
    throw err;
  }

  // Allow moving a task to a different sprint (TASK-10)
  if (updates.sprintId && updates.sprintId !== existing.sprintId.toString()) {
    const targetSprint = await Sprint.findById(updates.sprintId).select('teamId status');
    if (!targetSprint) {
      const err = new Error('Target sprint not found');
      err.statusCode = 404;
      throw err;
    }
    if (!accessibleTeamIds.includes(targetSprint.teamId.toString())) {
      const err = new Error('Target sprint not found');
      err.statusCode = 404;
      throw err;
    }
    if (targetSprint.status === 'COMPLETED') {
      const err = new Error('Cannot move task into a completed sprint.');
      err.statusCode = 400;
      throw err;
    }
    sanitized.sprintId = updates.sprintId;
    sanitized.teamId   = targetSprint.teamId;
  }

  const updated = await Task.findByIdAndUpdate(taskId, sanitized, { new: true })
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');

  if ('assigneeId' in sanitized) {
    await recordAssignmentChange(
      updated._id, updated.sprintId, existing.assigneeId, sanitized.assigneeId
    );
  }

  return updated;
}

async function deleteTask(taskId, userId) {
  const task = await Task.findById(taskId);
  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  const taskSprint = await Sprint.findById(task.sprintId).select('teamId status');
  if (!taskSprint || !accessibleTeamIds.includes(taskSprint.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  if (taskSprint.status === 'COMPLETED') {
    const err = new Error('Cannot delete a task from a completed sprint.');
    err.statusCode = 400;
    throw err;
  }

  await Task.findByIdAndDelete(taskId);
  await Assignment.deleteMany({ taskId });
}

async function assignTask(taskId, assigneeId, userId) {
  const task = await Task.findById(taskId);
  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  const taskSprint = await Sprint.findById(task.sprintId).select('teamId status');
  if (!taskSprint || !accessibleTeamIds.includes(taskSprint.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  if (taskSprint.status === 'COMPLETED') {
    const err = new Error('Cannot reassign tasks in a completed sprint.');
    err.statusCode = 400;
    throw err;
  }

  const prevAssigneeId = task.assigneeId;
  task.assigneeId = assigneeId || null;
  await task.save();

  await recordAssignmentChange(task._id, task.sprintId, prevAssigneeId, assigneeId);

  return Task.findById(task._id)
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');
}

async function updateTaskStatus(taskId, status, userId) {
  if (!TASK.STATUSES.includes(status)) {
    const err = new Error('Invalid status value');
    err.statusCode = 400;
    throw err;
  }

  const existing = await Task.findById(taskId).select('teamId sprintId');
  if (!existing) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(existing.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  await assertSprintMutable(existing.sprintId);

  return Task.findByIdAndUpdate(taskId, { status }, { new: true })
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');
}

async function addComment(taskId, text, userId) {
  if (!text || !text.trim()) {
    const err = new Error('Comment text is required');
    err.statusCode = 400;
    throw err;
  }

  const task = await Task.findById(taskId);
  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(task.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  task.comments.push({ authorId: userId, text: text.trim(), createdAt: new Date() });
  await task.save();

  return Task.findById(task._id)
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash')
    .populate('comments.authorId', 'name email');
}

async function getComments(taskId, userId) {
  const task = await Task.findById(taskId).populate('comments.authorId', 'name email');

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(task.teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  return task.comments;
}

module.exports = {
  createTask,
  getTask,
  getTasks,
  updateTask,
  deleteTask,
  assignTask,
  updateTaskStatus,
  addComment,
  getComments,
};
