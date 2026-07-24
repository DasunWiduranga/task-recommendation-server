const Team = require('../models/Team');
const Sprint = require('../models/Sprint');

async function getAccessibleTeamIds(userId) {
  const teams = await Team.find({
    $or: [{ memberIds: userId }, { adminId: userId }],
  }).select('_id');

  return teams.map(team => team._id.toString());
}

async function getAccessibleSprintFilter(userId) {
  const teamIds = await getAccessibleTeamIds(userId);

  if (teamIds.length === 0) {
    return { sprintIds: [], teamIds };
  }

  const sprints = await Sprint.find({ teamId: { $in: teamIds } }).select('_id');
  return {
    sprintIds: sprints.map(sprint => sprint._id.toString()),
    teamIds,
  };
}

module.exports = {
  getAccessibleTeamIds,
  getAccessibleSprintFilter,
};