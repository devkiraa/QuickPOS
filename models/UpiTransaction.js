const mongoose = require('mongoose');

const UpiTransactionSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  upiId: { type: String, required: true },
  qrCode: { type: String, required: true }, // Base64 encoded QR code image
  status: { type: String, default: "Pending" }, // "Pending" or "Paid"
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UpiTransaction', UpiTransactionSchema, 'upi_transactions');
