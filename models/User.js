// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  // In a production app, you would hash passwords!
  password: { type: String, required: true },
  role: { type: String, default: 'canteen manager' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
