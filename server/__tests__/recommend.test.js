const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const app = require('../server');

describe('Recommendation Routes', () => {
  let authToken;
  let taskId;
  let sprintId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/agile_recommender_test');

    const user = await User.create({
      name: 'Rec Tester',
      email: 'rec@test.com',
      passwordHash: await require('bcryptjs').hash('test123', 10),
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rec@test.com', password: 'test123' });
    authToken = loginRes.body.data.token;

    const team = await require('../models/Team').create({
      name: 'Rec Team',
      adminId: user._id,
      memberIds: [user._id],
    });

    const sprint = await Sprint.create({
      teamId: team._id,
      name: 'Rec Sprint',
      status: 'active',
    });
    sprintId = sprint._id;

    const task = await Task.create({
      sprintId: sprintId,
      title: 'React Frontend Task',
      description: 'Build UI using React and TypeScript with CSS styling',
      storyPoints: 5,
      teamId: team._id,
      reporterId: user._id,
    });
    taskId = task._id;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  describe('GET /api/recommend/:taskId', () => {
    it('should return recommendations for a task', async () => {
      const res = await request(app)
        .get(`/api/recommend/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recommendations).toBeDefined();
      expect(Array.isArray(res.body.data.recommendations)).toBe(true);
    });

    it('should include score breakdown for each recommendation', async () => {
      const res = await request(app)
        .get(`/api/recommend/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.data.recommendations.length > 0) {
        const rec = res.body.data.recommendations[0];
        expect(rec.breakdown).toBeDefined();
        expect(typeof rec.breakdown.nlp).toBe('number');
        expect(typeof rec.breakdown.cf).toBe('number');
        expect(typeof rec.breakdown.capacity).toBe('number');
      }
    });

    it('should reject without auth token', async () => {
      const res = await request(app).get(`/api/recommend/${taskId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/feedback', () => {
    it('should log accept feedback', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId.toString(),
          developerId: 'user-alice-001',
          action: 'accept',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feedback).toBeDefined();
    });

    it('should log reject feedback', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId.toString(),
          developerId: 'user-bob-001',
          action: 'reject',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid action', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId.toString(),
          developerId: 'user-alice-001',
          action: 'invalid',
        });

      expect(res.status).toBe(400);
    });
  });
});