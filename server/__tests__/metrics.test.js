const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const app = require('../server');

// Gini coefficient utility
function giniCoefficient(values) {
  if (!values || values.length === 0) return 0;
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.max(0, Math.min(1, numerator / (n * sum)));
}

describe('Metrics Routes', () => {
  let authToken;
  let sprintId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/agile_recommender_test');

    const user = await User.create({
      name: 'Metrics Tester',
      email: 'metrics@test.com',
      passwordHash: await require('bcryptjs').hash('test123', 10),
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'metrics@test.com', password: 'test123' });
    authToken = loginRes.body.data.token;

    const team = await require('../models/Team').create({
      name: 'Metrics Team',
      adminId: user._id,
      memberIds: [user._id],
    });

    const sprint = await Sprint.create({
      teamId: team._id,
      name: 'Metrics Sprint',
      status: 'active',
    });
    sprintId = sprint._id;

    // Create tasks with different assignments
    const devs = [];
    for (let i = 0; i < 5; i++) {
      const dev = await User.create({
        name: `Dev ${i}`,
        email: `dev${i}@test.com`,
        passwordHash: 'hashed',
        role: 'developer',
      });
      devs.push(dev);
      await Task.create({
        sprintId: sprintId,
        title: `Task for Dev ${i}`,
        description: 'Test',
        storyPoints: (i + 1) * 3,
        assigneeId: dev._id,
        teamId: team._id,
        reporterId: user._id,
      });
    }
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  describe('GET /api/metrics/workload/:sprintId', () => {
    it('should return workload metrics with Gini coefficient', async () => {
      const res = await request(app)
        .get(`/api/metrics/workload/${sprintId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.giniCoefficient).toBeDefined();
      expect(typeof res.body.data.giniCoefficient).toBe('number');
      expect(res.body.data.workloads).toBeDefined();
    });
  });

  describe('GET /api/metrics/accuracy', () => {
    it('should return accuracy metrics', async () => {
      const res = await request(app)
        .get('/api/metrics/accuracy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.precision).toBeDefined();
      expect(res.body.data.recall).toBeDefined();
    });
  });
});

describe('Gini Coefficient', () => {
  it('should return 0 for equal distribution', () => {
    expect(giniCoefficient([10, 10, 10, 10])).toBeCloseTo(0, 2);
  });

  it('should return 1 for maximum inequality', () => {
    const values = new Array(10).fill(0);
    values[0] = 100;
    expect(giniCoefficient(values)).toBeCloseTo(1, 2);
  });

  it('should handle empty array', () => {
    expect(giniCoefficient([])).toBe(0);
  });

  it('should handle single value', () => {
    expect(giniCoefficient([5])).toBe(0);
  });

  it('should handle real sprint data', () => {
    const workloads = [5, 8, 13, 5, 3]; // Alice, Bob, Carol, Dave, Eve
    const gini = giniCoefficient(workloads);
    expect(gini).toBeGreaterThan(0);
    expect(gini).toBeLessThan(1);
  });
});