const axios = require('axios');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const Team = require('../models/Team');
const User = require('../models/User');
const Recommendation = require('../models/Recommendation');
const Feedback = require('../models/Feedback');
const Assignment = require('../models/Assignment');
const TrainingRun = require('../models/TrainingRun');
const { ML } = require('../constants');

async function getStats() {
  const [totalUsers, totalTeams, totalTasks, activeSprints, totalRecommendations, feedbackCount] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Team.countDocuments(),
    Task.countDocuments(),
    Sprint.countDocuments({ status: 'ACTIVE' }),
    Recommendation.countDocuments(),
    Feedback.countDocuments(),
  ]);

  return { totalUsers, totalTeams, totalTasks, activeSprints, totalRecommendations, feedbackCount };
}

async function getModelStatus() {
  const [totalSamples, lastFeedback, lastTraining] = await Promise.all([
    Feedback.countDocuments(),
    Feedback.findOne().sort({ createdAt: -1 }).select('createdAt'),
    TrainingRun.findOne({ retrained: true }).sort({ createdAt: -1 }).populate('triggeredBy', 'name email'),
  ]);
  return {
    totalTrainingSamples: totalSamples,
    lastFeedbackAt:       lastFeedback ? lastFeedback.createdAt : null,
    lastTraining,
  };
}

async function retrainModel(triggeredBy = null) {
  const [developers, tasks, assignments] = await Promise.all([
    User.find({ role: 'developer', isActive: true }).select('name skillTags'),
    Task.find().select('title description componentLabels'),
    Assignment.find().select('developerId taskId accepted'),
  ]);

  const payload = {
    developers: developers.map(d => ({ id: d._id.toString(), name: d.name, skillTags: d.skillTags || [] })),
    tasks:       tasks.map(t => ({ id: t._id.toString(), title: t.title, description: t.description || '', componentTags: t.componentLabels || [] })),
    assignments: assignments.map(a => ({
      developer_id: a.developerId.toString(),
      task_id:      a.taskId.toString(),
      accepted:     a.accepted,
    })),
  };

  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  try {
    const mlResponse = await axios.post(`${mlServiceUrl}/retrain`, payload, { timeout: ML.TIMEOUT_RETRAIN });
    const result = {
      developers:  payload.developers.length,
      tasks:       payload.tasks.length,
      assignments: payload.assignments.length,
      ...mlResponse.data,
    };

    await TrainingRun.create({
      status:          result.status || 'ok',
      retrained:       !!result.retrained,
      developers:      result.developers,
      tasks:           result.tasks,
      assignments:     result.assignments,
      cfMatrixDensity: result.cf_matrix_density ?? null,
      trainedAt:       result.trained_at ? new Date(result.trained_at) : new Date(),
      triggeredBy,
    });

    return result;
  } catch (mlError) {
    const err = new Error(`ML service unavailable: ${mlError.message}`);
    err.statusCode = 503;
    throw err;
  }
}

module.exports = { getStats, getModelStatus, retrainModel };
