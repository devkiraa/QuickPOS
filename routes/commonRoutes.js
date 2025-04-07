// routes/commonRoutes.js

const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Upi = require("../models/Upi");
const FoodItem = require("../models/FoodItem");

/**
 * GET /list
 * Fetches a list of orders (most recent first) and renders an order list page.
 */
router.get("/list", async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    const activeUpi = await Upi.findOne({ active: true });
    const allFoodItems = await FoodItem.find({});
    if (req.query.ajax) {
      return res.json({ orders });
    }
    res.render("orderList", {
      orders,
      user: req.session.user,
      activeUpi,
      allFoodItems,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching order list");
  }
});

/**
 * GET /details/:orderId
 * Fetches and returns the details of a specific order.
 */
router.get("/details/:orderId", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error fetching order details" });
  }
});

/**
 * POST /modify/:orderId
 * Modifies an order by adding extra payment and/or additional items.
 * It updates the order total accordingly.
 */
router.post("/modify/:orderId", async (req, res) => {
  try {
    console.log("Modify order request body:", req.body);
    const orderId = req.params.orderId;
    const { extraAmount, additionalItems, paymentMode, upiId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Initialize orderData if it does not exist.
    order.orderData = order.orderData || {};
    if (!order.orderData.originalTotal) {
      order.orderData.originalTotal = order.totalAmount || 0;
      console.log("Setting originalTotal to:", order.orderData.originalTotal);
    }
    const originalTotal = order.orderData.originalTotal;
    console.log("Original total:", originalTotal);

    // Merge any additional items into the existing orderData.
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
        return res.status(400).json({
          success: false,
          message: "Invalid JSON for additional items",
        });
      }
    }
    order.orderData.additionalItems = existingAdditional;
    console.log("Merged additional items:", existingAdditional);

    // Validate and set extra payment.
    const extra = Number(extraAmount);
    if (isNaN(extra)) {
      return res
        .status(400)
        .json({ success: false, message: "Extra amount must be a number" });
    }
    order.orderData.extraPayment = extra;
    console.log("Extra payment:", extra);

    // Calculate total for additional items.
    let additionalTotal = 0;
    for (const key in existingAdditional) {
      const item = existingAdditional[key];
      additionalTotal += item.price * item.quantity;
    }
    console.log("Additional items total:", additionalTotal);

    // Update the overall total amount of the order.
    order.totalAmount = originalTotal + additionalTotal + extra;
    console.log("New total calculated:", order.totalAmount);

    // Update payment mode and UPI details if needed.
    order.paymentMode = paymentMode;
    if (paymentMode === "UPI") {
      order.upiId = upiId;
    }

    await order.save();
    console.log("Order modified successfully in DB. Order ID:", order.orderId);
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in modify endpoint:", err);
    res.status(500).json({
      success: false,
      message: "Error modifying order: " + err.message,
    });
  }
});

/**
 * DELETE /delete/:orderId
 * Deletes an order from the database.
 */
router.delete("/delete/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const result = await Order.deleteOne({ orderId });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in delete endpoint:", err);
    res.status(500).json({
      success: false,
      message: "Error deleting order: " + err.message,
    });
  }
});

router.post("/initiate-upi", async (req, res) => {
  try {
    const { orderId, amount, upiId } = req.body;

    // Basic validation
    if (!orderId || !amount || !upiId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: orderId, amount, or upiId.",
      });
    }

    // Optional: Check if a pending transaction already exists for this orderId
    // to potentially avoid duplicates if the user clicks UPI multiple times.
    // const existingPendingTxn = await UpiTransaction.findOne({ orderId: orderId, status: "Pending" });
    // if (existingPendingTxn) {
    //   console.log(`Pending UPI transaction already exists for orderId: ${orderId}`);
    //   // You could just return success here, or update the timestamp of the existing one.
    //   // For now, we'll allow creating potentially multiple pending records if clicked repeatedly,
    //   // as '/complete-payment' uses updateMany which handles this scenario.
    //   // return res.json({ success: true, message: "UPI transaction already initiated." });
    // }

    // Create a new UPI transaction record with "Pending" status
    const newTransaction = new UpiTransaction({
      orderId: orderId,
      amount: Number(amount), // Ensure amount is stored as a number
      upiId: upiId,
      status: "Pending", // Set initial status to Pending
      paymentMode: "UPI", // Explicitly set payment mode
      // Add timestamp if your schema doesn't handle it automatically
      // createdAt: new Date()
    });

    await newTransaction.save();
    console.log(
      `UPI transaction initiated and saved for orderId: ${orderId}`
    );

    res.json({ success: true, message: "UPI transaction initiated." });
  } catch (err) {
    console.error("Error in /initiate-upi endpoint:", err);
    res.status(500).json({
      success: false,
      message: "Error initiating UPI transaction: " + err.message,
    });
  }
});

/**
 * POST /complete-payment
 * Marks an order as paid and, if the payment was via UPI, updates related transaction statuses.
 * (This route remains unchanged)
 */
router.post("/complete-payment", async (req, res) => {
  // ... your existing code for /complete-payment ...
  // It correctly finds the Order and uses UpiTransaction.updateMany
  // to set the status to "Paid", which will update the record created above.
  try {
    const { orderId, paymentMode, upiId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    order.status = "Paid";
    order.paymentMode = paymentMode;
    if (paymentMode === "UPI" && upiId) {
      order.upiId = upiId; // Store the UPI ID used on the Order as well
    }
    await order.save();

    // If payment was made using UPI, update the UPI transaction record(s).
    if (paymentMode === "UPI") {
      const UpiTransaction = require('../models/UpiTransaction'); // Already required above
      const updateResult = await UpiTransaction.updateMany(
        { orderId: orderId }, // Find transaction(s) by orderId
        { $set: { status: "Paid" } } // Set status to Paid
      );
      console.log(
        `Updated ${updateResult.modifiedCount} UPI transaction(s) to Paid for orderId: ${orderId}`
      );
    }

    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error in complete-payment endpoint:", err);
    res.status(500).json({
      success: false,
      message: "Error completing payment: " + err.message,
    });
  }
});

/**
 * GET /success
 * Renders the success page with order details if an orderId is provided.
 */
router.get("/success", async (req, res) => {
  try {
    const orderId = req.query.orderId;
    let order = null;
    if (orderId) {
      // Populate food item details for the order.
      order = await Order.findOne({ orderId })
        .populate("items.foodItem")
        .exec();
    }
    const activeUpi = await Upi.findOne({ active: true });
    res.render("success", { order, activeUpi });
  } catch (err) {
    console.error(err);
    res.render("success", { order: null, activeUpi: null });
  }
});

/**
 * GET /upi/active
 * Returns details of the active UPI account.
 */
router.get("/upi/active", async (req, res) => {
  try {
    const activeUpi = await Upi.findOne({ active: true });
    if (!activeUpi) {
      return res.json({ success: false, message: "No active UPI account." });
    }
    res.json({ success: true, activeUpi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching UPI details" });
  }
});

/**
 * GET /online
 * Renders the online orders page used for payment reception, including order and UPI details.
 */
router.get("/online", async (req, res) => {
  try {
    const orders = await Order.find({ orderSource: "online" })
      .sort({ createdAt: -1 })
      .populate("items.foodItem")
      .exec();
    const activeUpi = await Upi.findOne({ active: true });
    res.render("onlineOrders", { orders, user: req.session.user, activeUpi });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching online orders");
  }
});

module.exports = router;
