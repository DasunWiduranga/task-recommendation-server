const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'scrum_master', 'developer'], default: 'developer' },
    bio: { type: String, default: '' },
    skillTags: [{ type: String, trim: true }],
    preferredTaskTypes: [{ type: String, enum: ['Backend', 'Frontend', 'DevOps', 'QA', 'Database'], trim: true }],
    teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    isActive: { type: Boolean, default: true },
    resetToken: { type: String, default: null, select: false },
    resetTokenExpires: { type: Date, default: null, select: false },
    preferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        themeMode: 'system',
        fontSize: 14,
        compactMode: false,
        reducedMotion: false,
        emailNotifications: true,
        pushNotifications: true,
        notificationSound: true,
        weeklyDigest: true,
        sprintAlerts: true,
        assignmentAlerts: true,
        mlSuggestions: true,
        accentColor: 'indigo',
        autoSave: true,
        autoSaveInterval: 30,
        dataRetention: '90',
      },
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (!this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.index({ teamIds: 1 });
userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);