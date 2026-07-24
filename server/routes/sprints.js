const express = require('express');
const router = express.Router();
const {
  createSprint,
  getSprint,
  getSprints,
  updateSprintStatus,
  updateSprint,
  deleteSprint,
  cloneSprint,
  startSprint,
  completeSprint,
} = require('../controllers/sprintController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// GET /api/sprints - List all sprints (with optional filters)
router.get('/', authMiddleware, getSprints);

// POST /api/sprints - Create new sprint
router.post('/', authMiddleware, requireRole('admin', 'scrum_master'), createSprint);

// GET /api/sprints/:id - Get single sprint with tasks and stats
router.get('/:id', authMiddleware, getSprint);

// PATCH /api/sprints/:id - Partial update sprint
router.patch('/:id', authMiddleware, updateSprint);

// PUT /api/sprints/:id - Full update sprint (for future use)
router.put('/:id', authMiddleware, requireRole('admin', 'scrum_master'), updateSprint);

// PATCH /api/sprints/:id/status - Update sprint status
router.patch('/:id/status', authMiddleware, updateSprintStatus);

// PATCH /api/sprints/:id/start - Start sprint
router.patch('/:id/start', authMiddleware, requireRole('admin', 'scrum_master'), startSprint);

// PATCH /api/sprints/:id/complete - Complete sprint
router.patch('/:id/complete', authMiddleware, requireRole('admin', 'scrum_master'), completeSprint);

// DELETE /api/sprints/:id - Delete sprint
router.delete('/:id', authMiddleware, requireRole('admin', 'scrum_master'), deleteSprint);

// POST /api/sprints/:id/clone - Clone sprint
router.post('/:id/clone', authMiddleware, requireRole('admin', 'scrum_master'), cloneSprint);

module.exports = router;
