const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    results: [
      {
        developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        nlpScore: { type: Number, min: 0, max: 1, required: true },
        cfScore: { type: Number, min: 0, max: 1, required: true },
        capacityScore: { type: Number, min: 0, max: 1, required: true },
        combinedScore: { type: Number, min: 0, max: 1, required: true },
        reasoning: { type: String },
      },
    ],
    accepted: { type: Boolean, default: false },
    acceptedDeveloperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

recommendationSchema.index({ taskId: 1 });
recommendationSchema.index({ requestedBy: 1 });
recommendationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
