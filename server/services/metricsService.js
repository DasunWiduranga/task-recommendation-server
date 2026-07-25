const axios = require('axios');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const Team = require('../models/Team');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const { ML } = require('../constants');

function giniCoefficient(values) {
  if (!values || values.length === 0) return 0;
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.max(0, Math.min(1, numerator / (n * sum)));
}

async function getWorkload(sprintId) {
  const sprint = await Sprint.findById(sprintId).select('_id capacityPoints teamId');
  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  const tasks = await Task.find({ sprintId }).populate('assigneeId', 'name email role skillTags');

  const teamDoc = await Team.findById(sprint.teamId).select('memberIds');
  const allDevIds = teamDoc?.memberIds || [];
  const allDevs = await User.find({ _id: { $in: allDevIds }, role: 'developer' })
    .select('name email role skillTags');

  const developerMap = {};
  allDevs.forEach(dev => {
    developerMap[dev._id.toString()] = { developer: dev, points: 0, tasks: [], taskCount: 0 };
  });

  tasks.forEach(task => {
    if (!task.assigneeId) return;
    const devId = task.assigneeId._id.toString();
    if (!developerMap[devId]) {
      developerMap[devId] = { developer: task.assigneeId, points: 0, tasks: [], taskCount: 0 };
    }
    developerMap[devId].points += task.storyPoints || 0;
    developerMap[devId].tasks.push({
      _id:         task._id,
      title:       task.title,
      storyPoints: task.storyPoints || 0,
      status:      task.status,
      priority:    task.priority,
    });
    developerMap[devId].taskCount += 1;
  });

  const workloads = Object.values(developerMap);
  const gini = giniCoefficient(workloads.map(w => w.points));
  const sprintCapacity = sprint.capacityPoints || 40;

  workloads.forEach(w => {
    w.capacityPct = Math.round((w.points / sprintCapacity) * 100);
  });

  return {
    workloads,
    giniCoefficient: gini,
    totalTasks:  tasks.length,
    totalPoints: tasks.reduce((s, t) => s + (t.storyPoints || 0), 0),
    sprintCapacity,
  };
}

async function getDeveloperWorkload(developerId, sprintId) {
  if (!sprintId) {
    const sprint = await Sprint.findOne({ status: 'ACTIVE' }).sort({ startDate: -1 });
    if (!sprint) {
      return { assignedPoints: 0, capacity: 0, utilizationPercent: 0, sprintId: null };
    }
    sprintId = sprint._id;
  }

  const sprint = await Sprint.findById(sprintId).select('_id capacityPoints');
  if (!sprint) {
    const err = new Error('Sprint not found.');
    err.statusCode = 404;
    throw err;
  }

  const tasks = await Task.find({ sprintId, assigneeId: developerId }).select('storyPoints');
  const assignedPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const capacity = sprint.capacityPoints || 0;
  const utilizationPercent = capacity > 0 ? Math.round((assignedPoints / capacity) * 100) : 0;

  return { assignedPoints, capacity, utilizationPercent, sprintId: sprint._id };
}

async function getAccuracy() {
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  try {
    const mlRes = await axios.get(`${mlServiceUrl}/accuracy`, { timeout: ML.TIMEOUT_ACCURACY });
    const { precision, recall, totalFeedback } = mlRes.data;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return {
      precision,
      recall,
      f1: Math.round(f1 * 10000) / 10000,
      totalFeedback,
      source: 'ml_service',
    };
  } catch {
    const [totalFeedback, acceptedFeedback] = await Promise.all([
      Feedback.countDocuments(),
      Feedback.countDocuments({ action: 'accept' }),
    ]);

    const precision = totalFeedback > 0 ? acceptedFeedback / totalFeedback : 0;
    const recall = precision;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      precision:     Math.round(precision * 10000) / 10000,
      recall:        Math.round(recall    * 10000) / 10000,
      f1:            Math.round(f1        * 10000) / 10000,
      totalFeedback,
      source:  'feedback_proxy',
      warning: 'ML service unavailable — metrics derived from feedback acceptance rate',
    };
  }
}

async function getEvaluation() {
  const [totalFeedback, acceptedFeedback] = await Promise.all([
    Feedback.countDocuments(),
    Feedback.countDocuments({ action: 'accept' }),
  ]);

  if (totalFeedback === 0) {
    return { precision: 0, recall: 0, f1: 0, totalSamples: 0, byDeveloper: [], byDay: {} };
  }

  const precision = acceptedFeedback / totalFeedback;
  const recall = precision;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const devAgg = await Feedback.aggregate([
    {
      $group: {
        _id:      '$developerId',
        total:    { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$action', 'accept'] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const devIds = devAgg.map(d => d._id).filter(Boolean);
  const users = await User.find({ _id: { $in: devIds } }).select('name email skillTags');
  const userMap = {};
  users.forEach(u => { userMap[u._id.toString()] = u; });

  const byDeveloper = devAgg.map(d => {
    const devId = d._id ? d._id.toString() : null;
    const user  = devId ? userMap[devId] : null;
    const rate  = d.total > 0 ? Math.round((d.accepted / d.total) * 10000) / 10000 : 0;
    return {
      developer: user
        ? { _id: user._id, name: user.name, email: user.email, skillTags: user.skillTags || [] }
        : { _id: devId, name: 'Unknown', email: '', skillTags: [] },
      accepted: d.accepted,
      total:    d.total,
      rate,
    };
  });

  const dayAgg = await Feedback.aggregate([
    { $match: { createdAt: { $exists: true, $ne: null } } },
    {
      $group: {
        _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total:    { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$action', 'accept'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDay = {};
  dayAgg.forEach(({ _id: day, accepted: a, total: t }) => {
    const p = t > 0 ? a / t : 0;
    byDay[day] = {
      precision: Math.round(p * 10000) / 10000,
      recall:    Math.round(p * 10000) / 10000,
      f1: p > 0 ? Math.round(((2 * p * p) / (p + p)) * 10000) / 10000 : 0,
    };
  });

  return {
    precision:    Math.round(precision * 10000) / 10000,
    recall:       Math.round(recall    * 10000) / 10000,
    f1:           Math.round(f1        * 10000) / 10000,
    totalSamples: totalFeedback,
    byDeveloper,
    byDay,
  };
}

module.exports = { getWorkload, getDeveloperWorkload, getAccuracy, getEvaluation };
