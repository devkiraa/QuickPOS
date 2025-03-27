// models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  // For online orders, orderId is a UUID.
  // For POS orders, orderId is a string like "#12345".
  orderId: { type: String, required: true },
  // Sequential reference number for customer display (e.g., 12345)
  orderNumber: { type: Number },
  customerName: { type: String, required: true },
  mobile: { type: String, required: true },
  items: [
    {
      foodItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
      quantity: { type: Number, default: 1 }
    }
  ],
  // Stores additional POS order data (raw order data, extra payments, etc.)
  orderData: { type: mongoose.Schema.Types.Mixed },
  paymentMode: { type: String }, // "Cash" or "UPI"
  upiId: { type: String },
  totalAmount: { type: Number },
  status: { type: String, default: 'Pending' },
  orderSource: { type: String }, // "counter" for POS orders, "online" for online orders
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);
