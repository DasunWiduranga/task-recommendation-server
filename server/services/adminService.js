const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const Team = require('../models/Team');
const User = require('../models/User');
const Recommendation = require('../models/Recommendation');
const Feedback = require('../models/Feedback');

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
  const [totalSamples, lastFeedback] = await Promise.all([
    Feedback.countDocuments(),
    Feedback.findOne().sort({ createdAt: -1 }).select('createdAt'),
  ]);
  return {
    totalTrainingSamples: totalSamples,
    lastFeedbackAt:       lastFeedback ? lastFeedback.createdAt : null,
  };
}

module.exports = { getStats, getModelStatus };
