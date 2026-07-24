const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    sprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['USER_STORY', 'BUG', 'TASK', 'SUBTASK'], default: 'TASK' },
    storyPoints: { type: Number, default: 1, min: 1, max: 13 },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    status: { type: String, enum: ['TO_DO', 'IN_PROGRESS', 'DONE'], default: 'TO_DO' },
    componentLabels: [{ type: String, trim: true }],
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: [
      {
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

taskSchema.index({ sprintId: 1 });
taskSchema.index({ teamId: 1 });
taskSchema.index({ assigneeId: 1 });
taskSchema.index({ reporterId: 1 });
taskSchema.index({ status: 1 });

module.exports = mongoose.model('Task', taskSchema);