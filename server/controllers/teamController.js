const teamService = require('../services/teamService');
const handleError = require('../utils/handleError');

// @route   POST /api/teams
// @access  Private (Admin, Scrum Master)
exports.createTeam = async (req, res, next) => {
  try {
    const team = await teamService.createTeam(req.body, req.user._id);
    res.status(201).json({ success: true, data: team });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/teams/:id
// @access  Private
exports.getTeam = async (req, res, next) => {
  try {
    const team = await teamService.getTeam(req.params.id);
    res.json({ success: true, data: team });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/teams
// @access  Private
exports.getTeams = async (req, res, next) => {
  try {
    const teams = await teamService.getTeams(req.user._id);
    res.json({ success: true, data: teams });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/teams/:id/invite
// @access  Private (Admin, Scrum Master)
exports.inviteUser = async (req, res, next) => {
  try {
    const result = await teamService.inviteUser(req.params.id, req.body.email, req.user._id, req.user.name);
    res.json({
      success: true,
      data:    { teamId: result.teamId, invitedUserId: result.invitedUserId },
      message: `${result.invitedUserName} has been invited to ${result.teamName}.`,
    });
  } catch (error) { handleError(error, res, next); }
};

// @route   PATCH /api/teams/:id
// @access  Private
exports.updateTeam = async (req, res, next) => {
  try {
    const team = await teamService.updateTeam(req.params.id, req.body);
    res.json({ success: true, data: team });
  } catch (error) { handleError(error, res, next); }
};

// @route   DELETE /api/teams/:id
// @access  Private (Admin, Scrum Master)
exports.deleteTeam = async (req, res, next) => {
  try {
    await teamService.deleteTeam(req.params.id);
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) { handleError(error, res, next); }
};

// @route   DELETE /api/teams/:id/members/:userId
// @access  Private (Admin, Scrum Master)
exports.removeMember = async (req, res, next) => {
  try {
    const team = await teamService.removeMember(req.params.id, req.params.userId);
    res.json({ success: true, data: team });
  } catch (error) { handleError(error, res, next); }
};
