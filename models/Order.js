//models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  customerName: { type: String, required: true },
  mobile: { type: String, required: true },
  items: [
    {
      foodItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
      quantity: { type: Number, default: 1 },
    },
  ],
  // Additional fields for POS orders:
  orderData: { type: mongoose.Schema.Types.Mixed }, // Stores POS order details and extra payments
  paymentMode: { type: String }, // "Cash" or "UPI"
  upiId: { type: String },       // if paymentMode is UPI, stores the UPI id used
  totalAmount: { type: Number }, // NEW FIELD: total order amount
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Order', OrderSchema);
