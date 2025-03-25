const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const Upi = require('../models/Upi');
const { v4: uuidv4 } = require('uuid');

// (Existing endpoints for new orders, menus, POS order placement, etc.)

// Endpoint: Get Order List (latest orders first)
router.get('/list', async (req, res) => {
    try {
      const orders = await Order.find({}).sort({ createdAt: -1 });
      const activeUpi = await Upi.findOne({ active: true });
      const allFoodItems = await FoodItem.find({});
      res.render('orderList', { orders, user: req.session.user, activeUpi, allFoodItems });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching order list");
    }
  });
  

// New endpoint to fetch order details
router.get('/details/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching order details" });
  }
});

router.post('/modify/:orderId', async (req, res) => {
    try {
      console.log("Modify order request body:", req.body);
      const orderId = req.params.orderId;
      const { extraAmount, additionalItems, paymentMode, upiId } = req.body;
      
      // Find the order by orderId
      const order = await Order.findOne({ orderId });
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      
      // Initialize orderData if not already present
      order.orderData = order.orderData || {};
      
      // Preserve original total on first modification
      if (!order.orderData.originalTotal) {
        order.orderData.originalTotal = order.totalAmount || 0;
        console.log("Setting originalTotal to:", order.orderData.originalTotal);
      }
      const originalTotal = order.orderData.originalTotal;
      console.log("Original total:", originalTotal);
      
      // Merge additionalItems if provided.
      let existingAdditional = order.orderData.additionalItems || {};
      if (additionalItems) {
        console.log("Received additionalItems:", additionalItems);
        try {
          const parsedAdditional = JSON.parse(additionalItems);
          // Merge: if item exists, add quantity; else, add new entry.
          for (const key in parsedAdditional) {
            if (existingAdditional[key]) {
              existingAdditional[key].quantity += parsedAdditional[key].quantity;
            } else {
              existingAdditional[key] = parsedAdditional[key];
            }
          }
        } catch (e) {
          console.error("Error parsing additionalItems:", e);
          return res.status(400).json({ success: false, message: "Invalid JSON for additional items" });
        }
      }
      order.orderData.additionalItems = existingAdditional;
      console.log("Merged additional items:", existingAdditional);
      
      // Set extra payment in orderData (convert to number)
      const extra = Number(extraAmount);
      if (isNaN(extra)) {
        return res.status(400).json({ success: false, message: "Extra amount must be a number" });
      }
      order.orderData.extraPayment = extra;
      console.log("Extra payment:", extra);
      
      // Calculate additional items total from merged additionalItems
      let additionalTotal = 0;
      for (const key in existingAdditional) {
        const item = existingAdditional[key];
        additionalTotal += item.price * item.quantity;
      }
      console.log("Additional items total:", additionalTotal);
      
      // New total = original total + additionalTotal + extra payment
      order.totalAmount = originalTotal + additionalTotal + extra;
      console.log("New total calculated:", order.totalAmount);
      
      // Update payment mode and UPI id if needed.
      order.paymentMode = paymentMode;
      if (paymentMode === "UPI") {
        order.upiId = upiId;
      }
      
      await order.save();
      console.log("Order modified successfully in DB. Order ID:", order.orderId);
      res.json({ success: true, orderId });
    } catch (err) {
      console.error("Error in modify endpoint:", err);
      res.status(500).json({ success: false, message: "Error modifying order: " + err.message });
    }
  });
  
  
// Endpoint: Delete an Order
router.delete('/delete/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    await Order.deleteOne({ orderId });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error deleting order" });
  }
});

// Existing POS Order Placement endpoint...
router.post('/place-pos', async (req, res) => {
  try {
    const { orderId, paymentMode, upiId, orderItems } = req.body;
    const parsedOrderItems = JSON.parse(orderItems);
    let totalAmount = 0;
    for (const key in parsedOrderItems) {
      const item = parsedOrderItems[key];
      totalAmount += item.price * item.quantity;
    }
    const newOrder = new Order({
      orderId: orderId,
      customerName: "POS Customer",
      mobile: "N/A",
      items: [],
      orderData: parsedOrderItems,
      paymentMode: paymentMode,
      upiId: paymentMode === "UPI" ? upiId : "",
      totalAmount: totalAmount,
      status: "Pending"
    });
    await newOrder.save();
    res.json({ success: true, orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error placing POS order" });
  }
});

// Existing success endpoint...
router.get('/success', (req, res) => {
  res.render('success');
});

module.exports = router;
