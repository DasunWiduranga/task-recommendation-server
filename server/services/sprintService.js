const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Team = require('../models/Team');
const { getAccessibleTeamIds } = require('../utils/access');
const { SPRINT } = require('../constants');

async function createSprint({ name, startDate, endDate, teamId, status, capacityPoints }) {
  if (!teamId || !name) {
    const err = new Error('teamId and name are required.');
    err.statusCode = 400;
    throw err;
  }

  const team = await Team.findById(teamId);
  if (!team) {
    const err = new Error('Team not found.');
    err.statusCode = 404;
    throw err;
  }

  const sprint = new Sprint({
    teamId,
    name,
    startDate:      startDate ? new Date(startDate) : undefined,
    endDate:        endDate   ? new Date(endDate)   : undefined,
    capacityPoints: capacityPoints || SPRINT.DEFAULT_CAPACITY,
    status:         status || SPRINT.DEFAULT_STATUS,
    taskIds:        [],
  });

  await sprint.save();
  await Team.findByIdAndUpdate(teamId, { $push: { sprintIds: sprint._id } });

  return Sprint.findById(sprint._id).populate('teamId', 'name');
}

async function getSprint(sprintId, userId) {
  const accessibleTeamIds = await getAccessibleTeamIds(userId);

  const sprint = await Sprint.findById(sprintId)
    .populate({
      path: 'teamId',
      select: 'name adminId memberIds',
      populate: [
        { path: 'adminId',   select: 'name email role skillTags' },
        { path: 'memberIds', select: 'name email role skillTags' },
      ],
    })
    .populate({
      path: 'taskIds',
      populate: [
        { path: 'assigneeId', select: 'name email skillTags' },
        { path: 'reporterId', select: 'name email' },
      ],
    });

  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  if (!accessibleTeamIds.includes(sprint.teamId._id.toString())) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  const tasks = sprint.taskIds || [];
  const totalPoints   = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const donePoints    = tasks.filter(t => t.status === 'DONE').reduce((s, t) => s + (t.storyPoints || 0), 0);
  const completionPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  return {
    ...sprint.toObject(),
    stats: {
      totalTasks:        tasks.length,
      totalPoints,
      donePoints,
      completionPct,
      capacityPoints:    sprint.capacityPoints,
      remainingCapacity: Math.max(0, sprint.capacityPoints - totalPoints),
      backlog:    tasks.filter(t => t.status === 'TO_DO').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      done:       tasks.filter(t => t.status === 'DONE').length,
    },
  };
}

async function getSprints({ teamId, status } = {}, userId) {
  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  const query = {};

  if (teamId) {
    if (!accessibleTeamIds.includes(teamId)) return [];
    query.teamId = teamId;
  } else if (accessibleTeamIds.length > 0) {
    query.teamId = { $in: accessibleTeamIds };
  } else {
    return [];
  }

  if (status) query.status = status;

  return Sprint.find(query)
    .populate({
      path: 'teamId',
      select: 'name adminId memberIds',
      populate: [
        { path: 'adminId',   select: 'name email role skillTags' },
        { path: 'memberIds', select: 'name email role skillTags' },
      ],
    })
    .populate({
      path: 'taskIds',
      select: 'title status storyPoints assigneeId priority',
      populate: { path: 'assigneeId', select: 'name email' },
    })
    .sort({ createdAt: -1 });
}

async function updateSprintStatus(sprintId, status) {
  if (!status) {
    const err = new Error('Status is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!SPRINT.STATUSES.includes(status)) {
    const err = new Error('Invalid status. Must be PLANNING, ACTIVE, or COMPLETED.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await Sprint.findById(sprintId);
  if (!existing) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }
  if (existing.status === 'COMPLETED' && status !== 'COMPLETED') {
    const err = new Error('Completed sprints are read-only and cannot be reopened.');
    err.statusCode = 400;
    throw err;
  }

  const sprint = await Sprint.findByIdAndUpdate(sprintId, { status }, { new: true })
    .populate('teamId', 'name');

  return sprint;
}

async function updateSprint(sprintId, body) {
  const existing = await Sprint.findById(sprintId);
  if (!existing) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }
  if (existing.status === 'COMPLETED') {
    const err = new Error('Completed sprints are read-only.');
    err.statusCode = 400;
    throw err;
  }

  const allowedFields = ['name', 'startDate', 'endDate', 'status', 'capacityPoints'];
  const updates = {};

  for (const field of allowedFields) {
    if (body[field] === undefined) continue;
    if (field === 'startDate' || field === 'endDate') {
      updates[field] = new Date(body[field]);
    } else if (field === 'status') {
      if (!SPRINT.STATUSES.includes(body[field])) {
        const err = new Error('Invalid status.');
        err.statusCode = 400;
        throw err;
      }
      updates[field] = body[field];
    } else {
      updates[field] = body[field];
    }
  }

  const sprint = await Sprint.findByIdAndUpdate(sprintId, updates, { new: true, runValidators: true })
    .populate('teamId', 'name')
    .populate({ path: 'taskIds', select: 'title status storyPoints' });

  return sprint;
}

async function deleteSprint(sprintId, deleteTasks) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  if (deleteTasks) {
    await Task.deleteMany({ sprintId });
  } else {
    await Task.updateMany({ sprintId }, { sprintId: null });
  }

  await Team.updateMany({ sprintIds: sprintId }, { $pull: { sprintIds: sprintId } });
  await Sprint.findByIdAndDelete(sprintId);
}

async function cloneSprint(sprintId, name) {
  const originalSprint = await Sprint.findById(sprintId).populate({ path: 'taskIds' });
  if (!originalSprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  const newSprint = new Sprint({
    teamId:    originalSprint.teamId,
    name:      name || `${originalSprint.name} (Copy)`,
    startDate: new Date(),
    endDate:   new Date(Date.now() + SPRINT.CLONE_DURATION_DAYS * 24 * 60 * 60 * 1000),
    status:    SPRINT.DEFAULT_STATUS,
    taskIds:   [],
  });
  await newSprint.save();

  if (originalSprint.taskIds?.length > 0) {
    const clonedIds = [];
    for (const t of originalSprint.taskIds) {
      const newTask = new Task({
        sprintId:    newSprint._id,
        title:       t.title,
        description: t.description,
        storyPoints: t.storyPoints,
        priority:    t.priority,
        status:      'TO_DO',
        assigneeId:  null,
        reporterId:  t.reporterId,
      });
      await newTask.save();
      clonedIds.push(newTask._id);
    }
    newSprint.taskIds = clonedIds;
    await newSprint.save();
  }

  await Team.findByIdAndUpdate(newSprint.teamId, { $push: { sprintIds: newSprint._id } });

  return Sprint.findById(newSprint._id)
    .populate('teamId', 'name')
    .populate({ path: 'taskIds', select: 'title status storyPoints' });
}

async function startSprint(sprintId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  if (sprint.status !== 'PLANNING') {
    const err = new Error('Only PLANNING sprints can be started.');
    err.statusCode = 400;
    throw err;
  }

  const active = await Sprint.findOne({ teamId: sprint.teamId, status: 'ACTIVE' });
  if (active) {
    const err = new Error('Team already has an active sprint.');
    err.statusCode = 400;
    throw err;
  }

  sprint.status    = 'ACTIVE';
  sprint.startDate = new Date();
  await sprint.save();

  return Sprint.findById(sprint._id).populate('teamId', 'name');
}

async function completeSprint(sprintId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  if (sprint.status !== 'ACTIVE') {
    const err = new Error('Only ACTIVE sprints can be completed.');
    err.statusCode = 400;
    throw err;
  }

  sprint.status  = 'COMPLETED';
  sprint.endDate = new Date();
  await sprint.save();

  return Sprint.findById(sprint._id).populate('teamId', 'name');
}

module.exports = {
  createSprint,
  getSprint,
  getSprints,
  updateSprintStatus,
  updateSprint,
  deleteSprint,
  cloneSprint,
  startSprint,
  completeSprint,
};
