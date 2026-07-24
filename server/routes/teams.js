const express = require('express');
const router = express.Router();
const {
  createTeam,
  getTeam,
  getTeams,
  inviteUser,
  updateTeam,
  deleteTeam,
  removeMember,
} = require('../controllers/teamController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// GET /api/teams - List all teams
router.get('/', authMiddleware, getTeams);

// POST /api/teams - Create new team
router.post('/', authMiddleware, requireRole('admin', 'scrum_master'), createTeam);

// GET /api/teams/:id - Get single team
router.get('/:id', authMiddleware, getTeam);

// PATCH /api/teams/:id - Update team
router.patch('/:id', authMiddleware, updateTeam);

// DELETE /api/teams/:id - Delete team
router.delete('/:id', authMiddleware, requireRole('admin', 'scrum_master'), deleteTeam);

// POST /api/teams/:id/invite - Invite user to team
router.post('/:id/invite', authMiddleware, requireRole('admin', 'scrum_master'), inviteUser);

// DELETE /api/teams/:id/members/:userId - Remove member from team
router.delete('/:id/members/:userId', authMiddleware, requireRole('admin', 'scrum_master'), removeMember);

module.exports = router;
