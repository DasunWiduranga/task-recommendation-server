const express = require('express');
const router = express.Router();
const {
  getRecommendation,
  acceptRecommendation,
  rejectRecommendation,
  getRecommendationByTask,
  getRecommendations,
} = require('../controllers/recommendationController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// GET  /api/recommend        - used by frontend recommendAPI.getForTask()
// This file is mounted at /api/recommend in server.js
router.get('/:taskId', authMiddleware, getRecommendation);

// POST /api/recommend/task/:taskId - role-gated legacy path (kept for scrum_master / admin flows)
router.post('/task/:taskId', authMiddleware, requireRole('admin', 'scrum_master'), getRecommendation);

// GET  /api/recommend/task/:taskId - fetch stored recommendation for a task
router.get('/task/:taskId', authMiddleware, getRecommendationByTask);

// GET  /api/recommend/all - all recommendations (with optional ?taskId filter)
router.get('/', authMiddleware, getRecommendations);

// POST /api/recommend/accept
router.post('/accept', authMiddleware, requireRole('admin', 'scrum_master'), acceptRecommendation);

// POST /api/recommend/reject
router.post('/reject', authMiddleware, requireRole('admin', 'scrum_master'), rejectRecommendation);

module.exports = router;