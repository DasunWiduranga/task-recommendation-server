const express = require('express');
const router = express.Router();
const {
  createTask,
  getTask,
  getTasks,
  updateTask,
  updateTaskStatus,
  deleteTask,
  assignTask,
  addComment,
  getComments,
} = require('../controllers/taskController');
const { authMiddleware } = require('../middleware/authMiddleware');

// GET /api/tasks - List all tasks (with optional sprint filter)
router.get('/', authMiddleware, getTasks);

// POST /api/tasks - Create new task
router.post('/', authMiddleware, createTask);

// GET /api/tasks/:id - Get single task
router.get('/:id', authMiddleware, getTask);

// PATCH /api/tasks/:id - Update task
router.patch('/:id', authMiddleware, updateTask);

// PATCH /api/tasks/:id/status - Update task status
router.patch('/:id/status', authMiddleware, updateTaskStatus);

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', authMiddleware, deleteTask);

// PATCH /api/tasks/:id/assign - Assign task to developer
router.patch('/:id/assign', authMiddleware, assignTask);

// POST /api/tasks/:id/comments - Add comment
router.post('/:id/comments', authMiddleware, addComment);

// GET /api/tasks/:id/comments - Get comments
router.get('/:id/comments', authMiddleware, getComments);

module.exports = router;