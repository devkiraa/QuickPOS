// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // <-- Added
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const Upi = require('../models/Upi');
const { v4: uuidv4 } = require('uuid');

/* ========================================================
   Online Orders (via Order Form and Menu)
   ======================================================== */

// GET: Render order form to collect customer details
router.get('/new', (req, res) => {
  res.render('orderForm');
});

// POST: Submit customer details and generate order id, then redirect to menu
router.post('/new', async (req, res) => {
  try {
    const { customerName, mobile } = req.body;
    const orderId = uuidv4();
    const newOrder = new Order({
      orderId,
      customerName,
      mobile,
      items: [], // For online orders, items will be filled during menu selection
      totalAmount: 0,
      status: "Pending"
    });
    await newOrder.save();
    res.redirect(`/orders/menu/${orderId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating new order");
  }
});

// GET: Render menu for the order
router.get('/menu/:orderId', async (req, res) => {
  try {
    const foodItems = await FoodItem.find({});
    res.render('menu', { orderId: req.params.orderId, foodItems });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading menu");
  }
});

// POST: Place Order from menu form submission
router.post('/place/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    // req.body.items is expected to be a JSON string (from a hidden input)
    const itemsData = JSON.parse(req.body.items); // itemsData should be an array of items
    const itemsArray = [];
    let totalAmount = 0;
    for (const item of itemsData) {
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: item.id, // assuming item.id is the FoodItem _id as a string
        quantity: item.quantity
      });
    }
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).send("Order not found");
    }
    order.items = itemsArray;
    order.totalAmount = totalAmount;
    await order.save();
    res.redirect('/orders/success?orderId=' + orderId);
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).send("Error placing order");
  }
});

/* ========================================================
   POS Orders (handled via AJAX)
   ======================================================== */

// POST: Place POS Order
router.post('/place-pos', async (req, res) => {
  try {
    const { orderId, paymentMode, upiId, orderItems, orderSource } = req.body;
    // Parse the order items (expected as JSON string)
    const parsedOrderItems = typeof orderItems === 'string' ? JSON.parse(orderItems) : orderItems;
    let totalAmount = 0;
    // Convert parsed order items into the format for the "items" array.
    const itemsArray = [];
    for (const key in parsedOrderItems) {
      const item = parsedOrderItems[key];
      totalAmount += item.price * item.quantity;
      // Use "new" to convert the id string to an ObjectId
      itemsArray.push({
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity
      });
    }
    const newOrder = new Order({
      orderId,
      customerName: "POS Customer",
      mobile: "N/A",
      items: itemsArray, // storing items in the "items" array
      orderData: parsedOrderItems, // also store raw POS order data if needed
      paymentMode,
      upiId: paymentMode === "UPI" ? upiId : "",
      totalAmount,
      status: "Pending",
      orderSource: orderSource || "counter"  // e.g. "counter" or "online"
    });
    await newOrder.save();
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in place-pos endpoint:", err);
    res.status(500).json({ success: false, message: "Error placing POS order: " + err.message });
  }
});

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

// Endpoint: Modify an Order (add extra payment and additional items)
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
    
    // Initialize orderData if not already present.
    order.orderData = order.orderData || {};
    
    // On first modification, preserve the original total.
    if (!order.orderData.originalTotal) {
      order.orderData.originalTotal = order.totalAmount || 0;
      console.log("Setting originalTotal to:", order.orderData.originalTotal);
    }
    const originalTotal = order.orderData.originalTotal;
    console.log("Original total:", originalTotal);
    
    // Merge additional items if provided.
    let existingAdditional = order.orderData.additionalItems || {};
    if (additionalItems) {
      console.log("Received additionalItems:", additionalItems);
      try {
        const parsedAdditional = JSON.parse(additionalItems);
        // Merge each new additional item into existing modifications.
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
    
    // Process extra amount.
    const extra = Number(extraAmount);
    if (isNaN(extra)) {
      return res.status(400).json({ success: false, message: "Extra amount must be a number" });
    }
    order.orderData.extraPayment = extra;
    console.log("Extra payment:", extra);
    
    // Calculate additional items total from modifications.
    let additionalTotal = 0;
    for (const key in existingAdditional) {
      const item = existingAdditional[key];
      additionalTotal += item.price * item.quantity;
    }
    console.log("Additional items total:", additionalTotal);
    
    // New total = original total + additional items total + extra payment.
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

// Existing success endpoint - updated to fetch and display order details if orderId is provided
router.get('/success', async (req, res) => {
  try {
    const orderId = req.query.orderId;
    let order = null;
    if (orderId) {
      // Populate items.foodItem so we can display the item name in success page.
      order = await Order.findOne({ orderId }).populate('items.foodItem').exec();
    }
    res.render('success', { order });
  } catch (err) {
    console.error(err);
    res.render('success', { order: null });
  }
});

module.exports = router;
