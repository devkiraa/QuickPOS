// models/Upi.js
const mongoose = require('mongoose');

const UpiSchema = new mongoose.Schema({
  upiId: { type: String, required: true },
  active: { type: Boolean, default: false },
});

module.exports = mongoose.model('Upi', UpiSchema);
