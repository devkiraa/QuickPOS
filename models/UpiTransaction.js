// models/UpiTransaction.js
const mongoose = require('mongoose');

const UpiTransactionSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  orderNumber: { type: Number, index: true },
  upiId: { type: String, required: true },
  qrCode: { type: String, required: true }, // Base64 encoded QR code image
  status: { type: String, default: "Pending", index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('UpiTransaction', UpiTransactionSchema, 'upi_transactions');
