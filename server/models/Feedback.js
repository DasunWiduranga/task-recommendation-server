const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    action: { type: String, enum: ['accept', 'reject'], required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' },
  },
  { timestamps: true }
);

feedbackSchema.index({ assignmentId: 1 });
feedbackSchema.index({ developerId: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);