const mongoose = require('mongoose');

const trainingRunSchema = new mongoose.Schema(
  {
    status:          { type: String, default: 'ok' },
    retrained:       { type: Boolean, default: false },
    developers:      { type: Number, default: 0 },
    tasks:           { type: Number, default: 0 },
    assignments:     { type: Number, default: 0 },
    cfMatrixDensity: { type: Number, default: null },
    trainedAt:       { type: Date, default: null },
    triggeredBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

trainingRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TrainingRun', trainingRunSchema);
