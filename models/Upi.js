// models/Upi.js
const mongoose = require('mongoose');

const UpiSchema = new mongoose.Schema({
  upiId: { type: String, required: true, unique: true },
  active: { type: Boolean, default: false, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Upi', UpiSchema);
