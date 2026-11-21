const mongoose = require('mongoose');

const ROLES = ['ADMIN', 'SALESMAN', 'PRODUCTION', 'ACCOUNTANT', 'STORE'];

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true }
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model('User', userSchema),
  ROLES
};
