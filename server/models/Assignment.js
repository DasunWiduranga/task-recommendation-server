const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accepted: { type: Boolean, required: true },
    sprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' },
  },
  { timestamps: true }
);

assignmentSchema.index({ taskId: 1 });
assignmentSchema.index({ developerId: 1 });
assignmentSchema.index({ sprintId: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);