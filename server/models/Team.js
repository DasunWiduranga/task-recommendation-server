const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sprintIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' }],
  },
  { timestamps: true }
);

teamSchema.index({ adminId: 1 });
teamSchema.index({ memberIds: 1 });

module.exports = mongoose.model('Team', teamSchema);