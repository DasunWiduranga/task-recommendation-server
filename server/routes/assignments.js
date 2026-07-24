const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/',    authMiddleware, assignmentController.listAssignments);
router.get('/:id', authMiddleware, assignmentController.getAssignment);

module.exports = router;
