require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agile_recommender';

// ─── Models ────────────────────────────────────────────────────────────────────
const User = require('../models/User');
const Team = require('../models/Team');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Assignment = require('../models/Assignment');

async function seed() {
  console.log('🌱 Starting database seed...');
  
  // Check if we need to connect
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }
  console.log('✅ Connected to MongoDB');

  // ─── Clear existing data ─────────────────────────────────────────────────────
  console.log('🗑️  Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Sprint.deleteMany({}),
    Task.deleteMany({}),
    Assignment.deleteMany({}),
  ]);

  // ─── Create Users ───────────────────────────────────────────────────────────
  console.log('👥 Creating users...');
  const users = await User.insertMany([
    { name: 'Admin User', email: 'admin@agile.io', passwordHash: await bcrypt.hash('admin123', 10), role: 'admin', skillTags: ['Project Management', 'Agile', 'Scrum'] },
    { name: 'Alice Chen', email: 'alice@agile.io', passwordHash: await bcrypt.hash('alice123', 10), role: 'developer', skillTags: ['React', 'TypeScript', 'CSS', 'Figma'] },
    { name: 'Bob Martinez', email: 'bob@agile.io', passwordHash: await bcrypt.hash('bob123', 10), role: 'developer', skillTags: ['Node.js', 'Express', 'MongoDB', 'REST APIs'] },
    { name: 'Carol Singh', email: 'carol@agile.io', passwordHash: await bcrypt.hash('carol123', 10), role: 'developer', skillTags: ['Python', 'Machine Learning', 'scikit-learn', 'pandas'] },
    { name: 'Dave Kim', email: 'dave@agile.io', passwordHash: await bcrypt.hash('dave123', 10), role: 'developer', skillTags: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker'] },
    { name: 'Eve Johnson', email: 'eve@agile.io', passwordHash: await bcrypt.hash('eve123', 10), role: 'developer', skillTags: ['React', 'Redux', 'GraphQL', 'Jest'] },
    { name: 'Sarah Parker', email: 'sarah@agile.io', passwordHash: await bcrypt.hash('scrum123', 10), role: 'scrum_master', skillTags: ['Scrum', 'Agile', 'JIRA'] },
  ]);
  console.log(`   Created ${users.length} users`);

  // ─── Create Team ─────────────────────────────────────────────────────────────
  console.log('🔧 Creating team...');
  const team = await Team.create({
    name: 'Alpha Squad',
    adminId: users[0]._id,
    memberIds: users.map(u => u._id),
  });
  console.log(`   Created team: ${team.name}`);

  // ─── Create Sprint ───────────────────────────────────────────────────────────
  console.log('📦 Creating sprint...');
  const sprint = await Sprint.create({
    teamId: team._id,
    name: 'Sprint 1: Foundation',
    startDate: new Date('2024-01-05'),
    endDate: new Date('2024-01-19'),
    status: 'ACTIVE',
  });
  console.log(`   Created sprint: ${sprint.name}`);

  // ─── Create Tasks ───────────────────────────────────────────────────────────
  console.log('📋 Creating tasks...');
  const tasks = await Task.insertMany([
    { sprintId: sprint._id, teamId: team._id, title: 'Implement user authentication UI', description: 'Build login and registration forms using React and TypeScript with Figma designs. Implement form validation and responsive layout.', componentLabels: ['React', 'TypeScript', 'CSS', 'Figma'], storyPoints: 5, priority: 'HIGH', status: 'DONE', assigneeId: users[1]._id, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Build REST API for task management', description: 'Create Express.js REST API endpoints for CRUD operations on tasks. Integrate with MongoDB using Mongoose.', componentLabels: ['Node.js', 'Express', 'MongoDB', 'REST APIs'], storyPoints: 8, priority: 'HIGH', status: 'IN_PROGRESS', assigneeId: users[2]._id, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Train recommendation ML model', description: 'Implement collaborative filtering using Python and scikit-learn. Integrate with pandas for data processing.', componentLabels: ['Python', 'Machine Learning', 'scikit-learn', 'pandas'], storyPoints: 13, priority: 'CRITICAL', status: 'IN_PROGRESS', assigneeId: users[3]._id, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Containerise services with Docker', description: 'Create Dockerfiles for all services and set up docker-compose. Configure for containerised deployment.', componentLabels: ['Docker'], storyPoints: 5, priority: 'MEDIUM', status: 'IN_PROGRESS', assigneeId: users[4]._id, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Write Jest unit tests for frontend', description: 'Write comprehensive Jest unit tests for React components. Aim for 70% code coverage.', componentLabels: ['Jest', 'React'], storyPoints: 3, priority: 'MEDIUM', status: 'TO_DO', assigneeId: users[5]._id, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Design sprint board UI components', description: 'Create React components for the kanban-style sprint board using Figma mockups. Implement drag-and-drop.', componentLabels: ['React', 'CSS', 'Figma'], storyPoints: 8, priority: 'HIGH', status: 'TO_DO', assigneeId: null, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Implement NLP sentence transformer', description: 'Integrate sentence-transformers library to compute task-skill similarity using all-MiniLM-L6-v2 model.', componentLabels: ['Python', 'Machine Learning'], storyPoints: 8, priority: 'CRITICAL', status: 'TO_DO', assigneeId: null, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment. Set up Docker build pipeline.', componentLabels: ['Docker'], storyPoints: 5, priority: 'MEDIUM', status: 'TO_DO', assigneeId: null, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Build GraphQL API layer', description: 'Implement GraphQL schema and resolvers. Set up Apollo Client with Redux state management.', componentLabels: ['GraphQL', 'Redux', 'React'], storyPoints: 8, priority: 'MEDIUM', status: 'TO_DO', assigneeId: null, reporterId: users[0]._id },
    { sprintId: sprint._id, teamId: team._id, title: 'Set up PostgreSQL database schemas', description: 'Design and implement PostgreSQL database schemas for the Java Spring Boot application.', componentLabels: ['PostgreSQL', 'Java', 'Spring Boot'], storyPoints: 5, priority: 'HIGH', status: 'TO_DO', assigneeId: null, reporterId: users[0]._id },
  ]);
  console.log(`   Created ${tasks.length} tasks`);

  // Update sprint with taskIds
  await Sprint.findByIdAndUpdate(sprint._id, { taskIds: tasks.map(t => t._id) });

  // ─── Create Assignment Records ───────────────────────────────────────────────
  console.log('📊 Creating assignment records...');

  // Skill-based assignment pattern
  const assignmentData = [
    // Alice - React/UI tasks accepted, ML tasks rejected
    { taskId: tasks[0]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[5]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[2]._id, developerId: users[1]._id, accepted: false },
    // Bob - backend tasks accepted
    { taskId: tasks[1]._id, developerId: users[2]._id, accepted: true },
    { taskId: tasks[9]._id, developerId: users[2]._id, accepted: true },
    { taskId: tasks[6]._id, developerId: users[2]._id, accepted: false },
    // Carol - ML tasks accepted
    { taskId: tasks[2]._id, developerId: users[3]._id, accepted: true },
    { taskId: tasks[6]._id, developerId: users[3]._id, accepted: true },
    // Dave - DevOps tasks accepted
    { taskId: tasks[3]._id, developerId: users[4]._id, accepted: true },
    { taskId: tasks[7]._id, developerId: users[4]._id, accepted: true },
    // Eve - testing/React tasks accepted
    { taskId: tasks[4]._id, developerId: users[5]._id, accepted: true },
    { taskId: tasks[8]._id, developerId: users[5]._id, accepted: true },
    // Additional historical assignments for cold-start prevention
    { taskId: tasks[0]._id, developerId: users[5]._id, accepted: false },
    { taskId: tasks[1]._id, developerId: users[3]._id, accepted: false },
    { taskId: tasks[3]._id, developerId: users[2]._id, accepted: false },
    { taskId: tasks[4]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[5]._id, developerId: users[2]._id, accepted: false },
    { taskId: tasks[7]._id, developerId: users[3]._id, accepted: false },
    { taskId: tasks[8]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[9]._id, developerId: users[5]._id, accepted: false },
    // More historical data
    { taskId: tasks[0]._id, developerId: users[3]._id, accepted: false },
    { taskId: tasks[1]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[2]._id, developerId: users[5]._id, accepted: false },
    { taskId: tasks[3]._id, developerId: users[1]._id, accepted: false },
    { taskId: tasks[4]._id, developerId: users[3]._id, accepted: true },
    { taskId: tasks[5]._id, developerId: users[3]._id, accepted: true },
    { taskId: tasks[6]._id, developerId: users[4]._id, accepted: false },
    { taskId: tasks[7]._id, developerId: users[1]._id, accepted: true },
    { taskId: tasks[8]._id, developerId: users[4]._id, accepted: true },
    { taskId: tasks[9]._id, developerId: users[3]._id, accepted: false },
  ];

  const assignments = await Assignment.insertMany(
    assignmentData.map(a => ({ ...a, sprintId: sprint._id }))
  );
  console.log(`   Created ${assignments.length} assignment records`);

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed completed successfully!');
  console.log('═══════════════════════════════════════════════');
  console.log('📋 Login credentials:');
  console.log('   admin@agile.io    / admin123    (Admin)');
  console.log('   sarah@agile.io    / scrum123    (Scrum Master)');
  console.log('   alice@agile.io    / alice123    (Developer)');
  console.log('   bob@agile.io      / bob123      (Developer)');
  console.log('   carol@agile.io    / carol123    (Developer)');
  console.log('   eve@agile.io      / eve123      (Developer)');
  console.log('═══════════════════════════════════════════════\n');
}

// Export as module for use in server startup
module.exports = seed;

// Also support running as standalone script
if (require.main === module) {
  seed()
    .then(() => {
      console.log('🔌 Closing MongoDB connection');
      mongoose.connection.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}