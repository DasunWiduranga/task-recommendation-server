const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Team = require('./models/Team');
const Sprint = require('./models/Sprint');
const Task = require('./models/Task');

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Team.deleteMany({});
    await Sprint.deleteMany({});
    await Task.deleteMany({});
    console.log('Cleared existing data');

    // Create demo admin user
    const adminPassword = await bcrypt.hash('Demo@123', 10);
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@demo.com',
      passwordHash: adminPassword,
      role: 'admin',
      skillTags: ['Project Management', 'Leadership', 'Backend'],
    });
    console.log('Created admin user:', admin.email);

    // Create demo scrum master
    const scrumMasterPassword = await bcrypt.hash('Demo@123', 10);
    const scrumMaster = await User.create({
      name: 'Scrum Master',
      email: 'scrum@demo.com',
      passwordHash: scrumMasterPassword,
      role: 'scrum_master',
      skillTags: ['Agile', 'Team Leadership', 'Process Improvement'],
    });
    console.log('Created scrum master:', scrumMaster.email);

    // Create demo developers
    const devPassword = await bcrypt.hash('Demo@123', 10);
    const dev1 = await User.create({
      name: 'Alice Johnson',
      email: 'alice@demo.com',
      passwordHash: devPassword,
      role: 'developer',
      skillTags: ['React', 'JavaScript', 'Frontend', 'CSS'],
    });

    const dev2 = await User.create({
      name: 'Bob Smith',
      email: 'bob@demo.com',
      passwordHash: devPassword,
      role: 'developer',
      skillTags: ['Node.js', 'MongoDB', 'Backend', 'API Design'],
    });

    const dev3 = await User.create({
      name: 'Carol Davis',
      email: 'carol@demo.com',
      passwordHash: devPassword,
      role: 'developer',
      skillTags: ['Python', 'Machine Learning', 'Data Science', 'Backend'],
    });

    console.log('Created developers:', [dev1.email, dev2.email, dev3.email]);

    // Create demo team
    const team = await Team.create({
      name: 'Engineering Team',
      description: 'Main development team for AI Agile Task Recommendation System',
      adminId: admin._id,
      memberIds: [admin._id, scrumMaster._id, dev1._id, dev2._id, dev3._id],
      sprintIds: [],
    });
    console.log('Created team:', team.name);

    // Create demo sprint
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks later

    const sprint = await Sprint.create({
      teamId: team._id,
      name: 'Sprint 1 - Foundation Setup',
      startDate,
      endDate,
      status: 'ACTIVE',
      taskIds: [],
    });
    console.log('Created sprint:', sprint.name);

    // Add sprint to team
    await Team.findByIdAndUpdate(team._id, { $push: { sprintIds: sprint._id } });

    // Create demo tasks
    const tasks = [
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Setup React Frontend',
        description: 'Initialize React project with Tailwind CSS and set up basic routing structure.',
        storyPoints: 5,
        priority: 'high',
        status: 'IN_PROGRESS',
        assigneeId: dev1._id,
        reporterId: scrumMaster._id,
      },
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Create API Authentication',
        description: 'Implement JWT-based authentication with httpOnly cookies for secure token storage.',
        storyPoints: 8,
        priority: 'critical',
        status: 'IN_PROGRESS',
        assigneeId: dev2._id,
        reporterId: scrumMaster._id,
      },
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Setup MongoDB Schemas',
        description: 'Design and implement Mongoose schemas for User, Team, Sprint, and Task models.',
        storyPoints: 5,
        priority: 'high',
        status: 'DONE',
        assigneeId: dev2._id,
        reporterId: scrumMaster._id,
      },
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Build ML Recommendation Engine',
        description: 'Implement NLP-based task recommendation using sentence transformers and collaborative filtering.',
        storyPoints: 13,
        priority: 'high',
        status: 'IN_PROGRESS',
        assigneeId: dev3._id,
        reporterId: scrumMaster._id,
      },
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Create Dashboard UI',
        description: 'Build dashboard page showing sprint progress, team workload, and AI recommendations.',
        storyPoints: 8,
        priority: 'medium',
        status: 'TO_DO',
        assigneeId: null,
        reporterId: scrumMaster._id,
      },
      {
        sprintId: sprint._id,
        teamId: team._id,
        title: 'Setup Testing Infrastructure',
        description: 'Configure Jest and React Testing Library for unit and integration tests.',
        storyPoints: 3,
        priority: 'medium',
        status: 'TO_DO',
        assigneeId: null,
        reporterId: scrumMaster._id,
      },
    ];

    const createdTasks = await Task.create(tasks);
    console.log(`Created ${createdTasks.length} demo tasks`);

    // Update sprint with task IDs
    await Sprint.findByIdAndUpdate(sprint._id, {
      $push: { taskIds: { $each: createdTasks.map(t => t._id) } },
    });

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📋 Demo Accounts:');
    console.log('-------------------');
    console.log('Admin:        admin@demo.com / Demo@123');
    console.log('Scrum Master: scrum@demo.com / Demo@123');
    console.log('Developer 1:  alice@demo.com / Demo@123');
    console.log('Developer 2:  bob@demo.com   / Demo@123');
    console.log('Developer 3:  carol@demo.com / Demo@123');
    console.log('-------------------');
    console.log(`Team ID: ${team._id}`);
    console.log(`Sprint ID: ${sprint._id}`);

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedDatabase();
