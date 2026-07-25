const request = require('supertest');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const User = require('../models/User');
const app = require('../server');

let authToken;
let userId;
let sprintId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agile_recommender_test');

  // Create test user
  const user = await User.create({
    name: 'Task Tester',
    email: 'task@test.com',
    passwordHash: await require('bcryptjs').hash('test123', 10),
  });
  userId = user._id;

  // Get token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'task@test.com', password: 'test123' });
  authToken = loginRes.body.data.token;

  // Create sprint
  const team = await require('../models/Team').create({
    name: 'Test Team',
    adminId: userId,
    memberIds: [userId],
  });

  const sprint = await Sprint.create({
    teamId: team._id,
    name: 'Test Sprint',
    status: 'active',
  });
  sprintId = sprint._id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Task Routes', () => {
  beforeEach(async () => {
    await Task.deleteMany({});
  });

  describe('POST /api/tasks', () => {
    it('should create a task with valid token', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sprintId: sprintId.toString(),
          title: 'Test Task',
          description: 'Test description',
          storyPoints: 3,
          priority: 'medium',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Task');
    });

    it('should reject without token', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          sprintId: sprintId.toString(),
          title: 'Test Task',
          description: 'Test',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should get a task by id', async () => {
      const task = await Task.create({
        sprintId: sprintId,
        title: 'Get Test',
        description: 'Test',
        createdBy: userId,
      });

      const res = await request(app)
        .get(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Get Test');
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should update task fields', async () => {
      const task = await Task.create({
        sprintId: sprintId,
        title: 'Original',
        description: 'Original desc',
        createdBy: userId,
      });

      const res = await request(app)
        .patch(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated', status: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated');
      expect(res.body.data.status).toBe('done');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      const task = await Task.create({
        sprintId: sprintId,
        title: 'To Delete',
        description: 'Test',
        createdBy: userId,
      });

      const res = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await Task.findById(task._id);
      expect(deleted).toBeNull();
    });
  });
});