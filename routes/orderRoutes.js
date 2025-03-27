// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const Upi = require('../models/Upi');
const { v4: uuidv4 } = require('uuid');

/* ========================================================
   Helper Function for Sequential Order Number
   ======================================================== */

// Generate the next sequential order number (global for both online and POS orders)
async function generateNextOrderNumber() {
  const lastOrder = await Order.findOne({}).sort({ orderNumber: -1 });
  if (lastOrder && lastOrder.orderNumber) {
    return lastOrder.orderNumber + 1;
  }
  return 12345; // starting number for orders
}

/* ========================================================
   Online Orders (via Order Form and Menu)
   ======================================================== */

// GET: Render order form to collect customer details (Online)
router.get('/new', (req, res) => {
  res.render('orderForm');
});

// POST: Submit customer details and generate order id (Online)
router.post('/new', async (req, res) => {
  try {
    const { customerName, mobile } = req.body;
    // For online orders, orderId is a UUID.
    const orderId = uuidv4();
    const orderNumber = await generateNextOrderNumber();
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName,
      mobile,
      items: [],
      totalAmount: 0,
      status: "Pending",
      orderSource: "online"
    });
    await newOrder.save();
    res.redirect(`/orders/menu/${orderId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating new online order");
  }
});

// GET: Render menu for the online order
router.get('/menu/:orderId', async (req, res) => {
  try {
    const foodItems = await FoodItem.find({});
    const sections = await FoodItem.distinct('section');
    res.render('menu', { orderId: req.params.orderId, foodItems, sections });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading menu");
  }
});

// POST: Place Online Order from menu form submission
router.post('/place/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    // Expect req.body.items to be a JSON string representing an array of items.
    const itemsData = JSON.parse(req.body.items);
    const itemsArray = [];
    let totalAmount = 0;
    for (const item of itemsData) {
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: item.id, // item.id is the FoodItem _id (as string)
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
    console.error("Error placing online order:", err);
    res.status(500).send("Error placing online order");
  }
});

/* ========================================================
   POS Orders (handled via AJAX)
   ======================================================== */

// POST: Place POS Order (from counter)
router.post('/place-pos', async (req, res) => {
  try {
    const { paymentMode, upiId, orderItems, orderSource } = req.body;
    let orderId;
    // For POS orders, we generate a secure orderId differently:
    // If the order comes from counter, prefix with '#' and generate a sequential order number.
    // Otherwise, for online POS orders, use a UUID.
    if (orderSource === "counter") {
      const orderNumber = await generateNextOrderNumber();
      orderId = "#" + orderNumber;
    } else {
      orderId = uuidv4();
    }
    // Parse order items (expected as JSON string)
    const parsedOrderItems = typeof orderItems === 'string' ? JSON.parse(orderItems) : orderItems;
    let totalAmount = 0;
    const itemsArray = [];
    for (const key in parsedOrderItems) {
      const item = parsedOrderItems[key];
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity
      });
    }
    // For POS orders, we assign an orderNumber regardless of the orderSource.
    const orderNumber = await generateNextOrderNumber();
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName: "POS Customer",
      mobile: "N/A",
      items: itemsArray,
      orderData: parsedOrderItems,
      paymentMode,
      upiId: paymentMode === "UPI" ? upiId : "",
      totalAmount,
      status: "Pending",
      orderSource: orderSource || "counter"
    });
    await newOrder.save();
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in place-pos endpoint:", err);
    res.status(500).json({ success: false, message: "Error placing POS order: " + err.message });
  }
});// POST: Place POS Order (from counter)
router.post('/place-pos', async (req, res) => {
  try {
    const { paymentMode, upiId, orderItems, orderSource } = req.body;
    let orderId;
    // For POS orders, we generate a secure orderId differently:
    // If the order comes from counter, prefix with '#' and generate a sequential order number.
    // Otherwise, for online POS orders, use a UUID.
    if (orderSource === "counter") {
      const orderNumber = await generateNextOrderNumber();
      orderId = "#" + orderNumber;
    } else {
      orderId = uuidv4();
    }
    // Parse order items (expected as JSON string)
    const parsedOrderItems = typeof orderItems === 'string' ? JSON.parse(orderItems) : orderItems;
    let totalAmount = 0;
    const itemsArray = [];
    for (const key in parsedOrderItems) {
      const item = parsedOrderItems[key];
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity
      });
    }
    // For POS orders, we assign an orderNumber regardless of the orderSource.
    const orderNumber = await generateNextOrderNumber();
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName: "POS Customer",
      mobile: "N/A",
      items: itemsArray,
      orderData: parsedOrderItems,
      paymentMode,
      upiId: paymentMode === "UPI" ? upiId : "",
      totalAmount,
      status: "Pending",
      orderSource: orderSource || "counter"
    });
    await newOrder.save();
    // Return both orderId and orderNumber in the response
    res.json({ success: true, orderId, orderNumber });
  } catch (err) {
    console.error("Error in place-pos endpoint:", err);
    res.status(500).json({ success: false, message: "Error placing POS order: " + err.message });
  }
});

/* ========================================================
   Common Endpoints
   ======================================================== */

// GET: Order List (latest orders first)
// (For security, the page shows orderNumber for reference and orderId for internal viewing.)
router.get('/list', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    const activeUpi = await Upi.findOne({ active: true });
    const allFoodItems = await FoodItem.find({});
    // If this is an AJAX request (for auto-refresh/pagination), return JSON.
    if (req.query.ajax) {
      return res.json({ orders });
    }
    res.render('orderList', { orders, user: req.session.user, activeUpi, allFoodItems });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching order list");
  }
});

// GET: Fetch Order Details
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

// POST: Modify an Order (add extra payment and additional items)
router.post('/modify/:orderId', async (req, res) => {
  try {
    console.log("Modify order request body:", req.body);
    const orderId = req.params.orderId;
    const { extraAmount, additionalItems, paymentMode, upiId } = req.body;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    order.orderData = order.orderData || {};
    if (!order.orderData.originalTotal) {
      order.orderData.originalTotal = order.totalAmount || 0;
      console.log("Setting originalTotal to:", order.orderData.originalTotal);
    }
    const originalTotal = order.orderData.originalTotal;
    console.log("Original total:", originalTotal);
    
    let existingAdditional = order.orderData.additionalItems || {};
    if (additionalItems) {
      console.log("Received additionalItems:", additionalItems);
      try {
        const parsedAdditional = JSON.parse(additionalItems);
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
    
    const extra = Number(extraAmount);
    if (isNaN(extra)) {
      return res.status(400).json({ success: false, message: "Extra amount must be a number" });
    }
    order.orderData.extraPayment = extra;
    console.log("Extra payment:", extra);
    
    let additionalTotal = 0;
    for (const key in existingAdditional) {
      const item = existingAdditional[key];
      additionalTotal += item.price * item.quantity;
    }
    console.log("Additional items total:", additionalTotal);
    
    order.totalAmount = originalTotal + additionalTotal + extra;
    console.log("New total calculated:", order.totalAmount);
    
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

// DELETE: Delete an Order
router.delete('/delete/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const result = await Order.deleteOne({ orderId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in delete endpoint:", err);
    res.status(500).json({ success: false, message: "Error deleting order: " + err.message });
  }
});

// NEW: Complete Payment Endpoint - update order status from "Pending" to "Paid"
router.post('/complete-payment', async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    order.status = "Paid";
    await order.save();
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in complete-payment endpoint:", err);
    res.status(500).json({ success: false, message: "Error completing payment: " + err.message });
  }
});

// GET: Success Page (display order details if orderId provided)
router.get('/success', async (req, res) => {
  try {
    const orderId = req.query.orderId;
    let order = null;
    if (orderId) {
      order = await Order.findOne({ orderId }).populate('items.foodItem').exec();
    }
    // Fetch the active UPI document
    const activeUpi = await Upi.findOne({ active: true });
    res.render('success', { order, activeUpi });
  } catch (err) {
    console.error(err);
    res.render('success', { order: null, activeUpi: null });
  }
});


// NEW: Online Orders Page for Payment Reception
router.get('/online', async (req, res) => {
  try {
    // Fetch online orders only
    const orders = await Order.find({ orderSource: "online" })
      .sort({ createdAt: -1 })
      .populate('items.foodItem')
      .exec();
    res.render('onlineOrders', { orders, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching online orders");
  }
});

module.exports = router;
