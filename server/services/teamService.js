const Team = require('../models/Team');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getAccessibleTeamIds } = require('../utils/access');

async function createTeam({ name, description, memberIds }, userId) {
  if (!name) {
    const err = new Error('Team name is required');
    err.statusCode = 400;
    throw err;
  }

  const teamMemberIds = Array.from(
    new Set([userId.toString(), ...(memberIds || []).map(id => id.toString())])
  );

  const team = await Team.create({
    name,
    description: description || '',
    adminId:     userId,
    memberIds:   teamMemberIds,
  });

  await User.findByIdAndUpdate(userId, { $addToSet: { teamIds: team._id } });

  if (memberIds && memberIds.length > 0) {
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $addToSet: { teamIds: team._id } }
    );
  }

  return Team.findById(team._id)
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash');
}

async function getTeam(teamId) {
  const team = await Team.findById(teamId)
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash')
    .populate({ path: 'sprintIds', populate: { path: 'taskIds' } });

  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  return team;
}

async function getTeams(userId) {
  const accessibleTeamIds = await getAccessibleTeamIds(userId);
  return Team.find({ _id: { $in: accessibleTeamIds } })
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash')
    .sort({ createdAt: -1 });
}

async function inviteUser(teamId, email, inviterId, inviterName) {
  if (!email) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }

  const team = await Team.findById(teamId);
  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const err = new Error('User not found with this email');
    err.statusCode = 404;
    throw err;
  }

  const isAlreadyMember = team.memberIds.some(id => id.toString() === user._id.toString());
  if (isAlreadyMember) {
    const err = new Error('User is already a team member');
    err.statusCode = 400;
    throw err;
  }

  const existingInvite = await Notification.findOne({
    recipientId: user._id,
    teamId:      team._id,
    type:        'team_invite',
    status:      'pending',
  });

  if (existingInvite) {
    const err = new Error('Invitation already sent to this user');
    err.statusCode = 400;
    throw err;
  }

  await Notification.create({
    recipientId: user._id,
    senderId:    inviterId,
    teamId:      team._id,
    type:        'team_invite',
    title:       `Team invitation from ${inviterName}`,
    message:     `${inviterName} invited you to join ${team.name}.`,
    status:      'pending',
    read:        false,
  });

  return { teamId: team._id, invitedUserId: user._id, invitedUserName: user.name, teamName: team.name };
}

async function updateTeam(teamId, { name, description }) {
  const team = await Team.findById(teamId);
  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  if (name) team.name = name;
  if (description !== undefined) team.description = description;
  await team.save();

  return Team.findById(team._id)
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash');
}

async function deleteTeam(teamId) {
  const team = await Team.findById(teamId);
  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  await User.updateMany({ teamIds: teamId }, { $pull: { teamIds: teamId } });
  await Team.findByIdAndDelete(teamId);
}

async function removeMember(teamId, userId) {
  const team = await Team.findById(teamId);
  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  team.memberIds = team.memberIds.filter(id => id.toString() !== userId);
  await team.save();
  await User.findByIdAndUpdate(userId, { $pull: { teamIds: teamId } });

  return Team.findById(team._id)
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash');
}

module.exports = { createTeam, getTeam, getTeams, inviteUser, updateTeam, deleteTeam, removeMember };
