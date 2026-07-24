const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    capacityPoints: { type: Number, default: 40, min: 1 },
    status: { type: String, enum: ['PLANNING', 'ACTIVE', 'COMPLETED'], default: 'PLANNING' },
    taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  },
  { timestamps: true }
);

sprintSchema.index({ teamId: 1 });
sprintSchema.index({ status: 1 });

module.exports = mongoose.model('Sprint', sprintSchema);