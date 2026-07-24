const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

router.get('/',             authMiddleware, userController.getUsers);
router.get('/:id',          authMiddleware, userController.getUser);
router.patch('/:id/skills', authMiddleware, userController.updateSkills);
router.put('/:id',          authMiddleware, userController.updateUser);
router.delete('/:id',       authMiddleware, requireRole('admin'), userController.deactivateUser);

module.exports = router;
