// models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },  // UUID or "#12345"
  orderNumber: { type: Number, index: true },
  customerName: { type: String, required: true },
  mobile: { type: String, required: true, index: true },
  items: [
    {
      foodItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
      quantity: { type: Number, default: 1 }
    }
  ],
  orderData: { type: mongoose.Schema.Types.Mixed }, // additional POS data
  paymentMode: { type: String, enum: ['Cash', 'UPI'] },
  upiId: { type: String },
  totalAmount: { type: Number },
  status: { type: String, default: 'Pending', index: true },
  orderSource: { type: String, enum: ['counter', 'online'] },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
