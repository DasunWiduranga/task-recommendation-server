const axios = require('axios');
const Task = require('../models/Task');
const User = require('../models/User');
const Sprint = require('../models/Sprint');
const Recommendation = require('../models/Recommendation');
const Feedback = require('../models/Feedback');
const { getAccessibleTeamIds } = require('../utils/access');
const { ML } = require('../constants');

function generateLocalRecommendations(task, developers, workloads, sprintCapacity) {
  return developers
    .map(dev => {
      const taskText = `${task.title} ${task.description}`.toLowerCase();
      let nlpScore = 0.5;
      if (dev.skillTags && dev.skillTags.length > 0) {
        let matchCount = 0;
        dev.skillTags.forEach(skill => {
          if (taskText.includes(skill.toLowerCase())) matchCount++;
        });
        nlpScore = Math.min(1, 0.3 + (matchCount / Math.max(1, dev.skillTags.length)) * 0.7);
      }
      const devWorkload  = workloads[dev._id.toString()] || 0;
      const capacityScore = Math.max(0, 1 - devWorkload / sprintCapacity);
      const score = nlpScore * ML.WEIGHTS.NLP + ML.WEIGHTS.CF_NEUTRAL * ML.WEIGHTS.CF + capacityScore * ML.WEIGHTS.CAPACITY;
      return {
        developerId: dev._id.toString(),
        name:        dev.name,
        score,
        nlpScore,
        capacityScore,
        skillTags: dev.skillTags || [],
        reasoning: `${Math.round(nlpScore * 100)}% skill match, ${Math.round(capacityScore * 100)}% capacity available`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function getRecommendation(taskId, userId) {
  const task = await Task.findById(taskId).populate('sprintId');
  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const teamId = task.teamId ?? task.sprintId?.teamId;
  if (!teamId) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  if (!accessibleTeamIds.includes(teamId.toString())) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const sprint = await Sprint.findById(task.sprintId._id ?? task.sprintId).populate({
    path: 'teamId',
    select: '_id memberIds adminId',
  });

  if (!sprint) {
    const err = new Error('Sprint not found');
    err.statusCode = 404;
    throw err;
  }

  const teamMemberIds = sprint.teamId?.memberIds || [];
  const developers = await User.find({ _id: { $in: teamMemberIds }, role: 'developer' }).select('-passwordHash');

  if (developers.length === 0) {
    return { recommendations: [], message: 'No developers in this sprint team', cold_start: true };
  }

  const sprintTasks = await Task.find({ sprintId: sprint._id });
  const workloads = {};
  developers.forEach(d => {
    workloads[d._id.toString()] = sprintTasks
      .filter(t => t.assigneeId?.toString() === d._id.toString() && t._id.toString() !== task._id.toString())
      .reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  });

  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  try {
    const workloadsPayload = {};
    developers.forEach(d => { workloadsPayload[d._id.toString()] = workloads[d._id.toString()] || 0; });

    const assignmentsPayload = sprintTasks
      .filter(t => t.assigneeId && t._id.toString() !== task._id.toString())
      .map(t => ({ taskId: t._id.toString(), developerId: t.assigneeId.toString(), accepted: true }));

    const mlRequest = {
      task:        { id: task._id.toString(), description: `${task.title} ${task.description}`.trim(), componentTags: task.componentLabels || [] },
      developers:  developers.map(d => ({ id: d._id.toString(), name: d.name, skillTags: d.skillTags || [] })),
      assignments: assignmentsPayload,
      workloads:   workloadsPayload,
      sprintCapacity: sprint.capacityPoints || ML.WEIGHTS.CAPACITY,
    };

    const mlResponse = await axios.post(`${mlServiceUrl}/recommend`, mlRequest, { timeout: ML.TIMEOUT_RECOMMEND });
    const mlRecs = mlResponse.data.recommendations || [];

    const recommendation = new Recommendation({
      taskId:      task._id,
      requestedBy: userId,
      results: mlRecs.map(r => ({
        developerId:   r.developerId,
        nlpScore:      r.breakdown?.nlp      ?? 0.5,
        cfScore:       r.breakdown?.cf       ?? 0.5,
        capacityScore: r.breakdown?.capacity ?? 0.5,
        combinedScore: r.score ?? 0,
        reasoning: r.reasoning || 'Recommended based on matching skills and capacity',
      })),
    });
    await recommendation.save();

    const topRecs = mlRecs.slice(0, ML.TOP_RECOMMENDATIONS).map(r => ({
      developerId: r.developerId,
      name:        r.name,
      score:       r.score ?? 0,
      breakdown: {
        nlp:      r.breakdown?.nlp      ?? 0.5,
        cf:       r.breakdown?.cf       ?? 0.5,
        capacity: r.breakdown?.capacity ?? 0.5,
      },
      reasoning: r.reasoning || 'Based on historical patterns and current workload',
      skillTags: r.skillTags || developers.find(d => d._id.toString() === r.developerId)?.skillTags || [],
    }));

    return { recommendationId: recommendation._id, recommendations: topRecs, cold_start: mlResponse.data.cold_start || false };
  } catch (mlError) {
    console.warn('ML service unavailable, using local fallback:', mlError.message);

    const localRecs = generateLocalRecommendations(task, developers, workloads, sprint.capacityPoints || 40);

    const recommendation = new Recommendation({
      taskId:      task._id,
      requestedBy: userId,
      results: localRecs.map(r => ({
        developerId:   r.developerId,
        nlpScore:      r.nlpScore,
        cfScore:       ML.WEIGHTS.CF_NEUTRAL,
        capacityScore: r.capacityScore,
        combinedScore: r.score,
        reasoning:     r.reasoning,
      })),
    });
    await recommendation.save();

    const topLocalRecs = localRecs.slice(0, ML.TOP_RECOMMENDATIONS).map(r => ({
      developerId: r.developerId,
      name:        r.name,
      score:       r.score,
      breakdown:   { nlp: r.nlpScore, cf: ML.WEIGHTS.CF_NEUTRAL, capacity: r.capacityScore },
      reasoning:   r.reasoning,
      skillTags:   r.skillTags,
    }));

    return {
      recommendationId: recommendation._id,
      recommendations: topLocalRecs,
      cold_start: true,
      warning: 'ML service unavailable: using fallback recommendation',
    };
  }
}

async function acceptRecommendation({ recommendationId, taskId, developerId }) {
  if (!recommendationId || !taskId || !developerId) {
    const err = new Error('recommendationId, taskId, and developerId required');
    err.statusCode = 400;
    throw err;
  }

  const recommendation = await Recommendation.findById(recommendationId);
  if (!recommendation) {
    const err = new Error('Recommendation not found');
    err.statusCode = 404;
    throw err;
  }

  recommendation.accepted = true;
  recommendation.acceptedDeveloperId = developerId;
  await recommendation.save();

  const task = await Task.findByIdAndUpdate(taskId, { assigneeId: developerId }, { new: true })
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');

  await Feedback.create({ taskId, developerId, action: 'accept', timestamp: new Date() });

  return task;
}

async function rejectRecommendation({ recommendationId, taskId, developerId }) {
  if (!recommendationId || !taskId) {
    const err = new Error('recommendationId and taskId required');
    err.statusCode = 400;
    throw err;
  }

  const recommendation = await Recommendation.findById(recommendationId);
  if (recommendation) {
    recommendation.accepted = false;
    await recommendation.save();
  }

  const task = await Task.findByIdAndUpdate(taskId, { assigneeId: developerId || null }, { new: true })
    .populate('assigneeId', '-passwordHash')
    .populate('reporterId', '-passwordHash');

  if (developerId) {
    await Feedback.create({ taskId, developerId, action: 'reject', timestamp: new Date() });
  }

  return task;
}

async function logFeedback({ taskId, developerId, action }) {
  if (!taskId || !developerId || !action) {
    const err = new Error('taskId, developerId and action are required');
    err.statusCode = 400;
    throw err;
  }

  if (!['accept', 'reject'].includes(action)) {
    const err = new Error('action must be "accept" or "reject"');
    err.statusCode = 400;
    throw err;
  }

  return Feedback.create({ taskId, developerId, action, timestamp: new Date() });
}

async function getRecommendationByTask(taskId) {
  return Recommendation.findOne({ taskId })
    .populate('taskId')
    .populate('requestedBy', 'name email')
    .sort({ createdAt: -1 });
}

async function getRecommendations({ taskId } = {}) {
  const query = {};
  if (taskId) query.taskId = taskId;
  return Recommendation.find(query)
    .populate('taskId')
    .populate('requestedBy', 'name email')
    .sort({ createdAt: -1 });
}

module.exports = {
  getRecommendation,
  acceptRecommendation,
  rejectRecommendation,
  logFeedback,
  getRecommendationByTask,
  getRecommendations,
};
