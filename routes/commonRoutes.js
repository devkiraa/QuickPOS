const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Upi = require("../models/Upi");
const FoodItem = require("../models/FoodItem");
const QRCode = require("qrcode");
const UpiTransaction = require("../models/UpiTransaction");

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
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching order details" });
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
      return res.status(404).json({ success: false, message: "Order not found" });
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
      return res.status(404).json({ success: false, message: "Order not found" });
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
// This will remove orders with empty items, totalAmount: 0, older than 7 minutes
//router.delete('/cleanup/online-orders', async (req, res) => {
  //try {
    //const cutoff = new Date(Date.now() - 7 * 60 * 1000); // 7 minutes ago

    //const result = await Order.deleteMany({
      //status: 'Pending',
     // order_status: 'Preparing',
      //orderSource: 'online',
    //  totalAmount: 0,
     // items: { $size: 0 },
      //createdAt: { $lt: cutoff }
    //});

    //res.json({ success: true, deletedCount: result.deletedCount });
  //} catch (err) {
    //console.error('Cleanup failed:', err);
    //res.status(500).json({ success: false, error: err.message });
  //}
//});
// This route cleans up two types of orders:
// 1. Orders with empty items and totalAmount: 0 older than 7 minutes.
// 2. Orders (even with items) that are still Pending (i.e. not paid) and older than 10 minutes.
//    For orders with items, the corresponding FoodItem quantities will be updated (i.e. the deducted stock will be added back).
router.delete('/cleanup/online-orders', async (req, res) => {
  try {
    // Define cutoff times.
    const cutoffEmpty = new Date(Date.now() - 7 * 60 * 1000);  // 7 minutes ago for empty orders.
    const cutoffPlaced = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago for all pending orders.

    // ----- Cleanup Case A: Remove empty orders (totalAmount: 0 and items array is empty) -----
    const emptyResult = await Order.deleteMany({
      orderSource: 'online',
      status: 'Pending',       // Only remove if still pending (i.e. not paid).
      order_status: 'Preparing',
      totalAmount: 0,
      items: { $size: 0 },
      createdAt: { $lt: cutoffEmpty }
    });

    // ----- Cleanup Case B: Remove placed orders that are pending older than 10 minutes -----
    // Find all online orders that are still pending and older than 10 minutes.
    const placedOrders = await Order.find({
      orderSource: 'online',
      status: 'Pending',       // Only remove if order is still pending (i.e. not paid).
      createdAt: { $lt: cutoffPlaced }
    });

    // For each of these orders, if there are items, update the FoodItem stock,
    // then remove the order.
    for (const order of placedOrders) {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          // Increment the FoodItem's qty by the ordered quantity.
          await FoodItem.findByIdAndUpdate(
            item.foodItem,
            { $inc: { qty: item.quantity } }
          );
        }
      }
      // Delete the order after processing.
      await Order.findByIdAndDelete(order._id);
    }

    // Send a JSON response with cleanup results.
    res.json({
      success: true,
      emptyOrdersDeleted: emptyResult.deletedCount,
      placedOrdersDeleted: placedOrders.length
    });
  } catch (err) {
    console.error('Cleanup failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /initiate-upi
 * Initiates the UPI payment process for an order. It generates the UPI URI,
 * creates a QR code from the URI, saves the details in upi_transactions,
 * and updates the Order document with a reference to the generated UPI transaction.
 */
router.post("/initiate-upi", async (req, res) => {
  try {
    const { orderId, amount, upiId } = req.body;

    if (!orderId || typeof amount !== "number" || !upiId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ success: false, message: "Amount must be a number" });
    }

    // ✅ Fetch orderNumber from existing order document
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const orderNumber = order.orderNumber || null;

    const tn = encodeURIComponent(`Payment for Order #${orderNumber || orderId}`);
    const formattedAmount = numericAmount.toFixed(2);
    const upiUri = `upi://pay?pa=${upiId}&am=${formattedAmount}&cu=INR&tn=${tn}`;

    const dataUrl = await QRCode.toDataURL(upiUri);
    const base64Image = dataUrl.split(",")[1];

    // ✅ Save with orderNumber included
    const newTransaction = new UpiTransaction({
      orderId,
      upiId,
      orderNumber, // ✅ Add this line if orderNumber is available
      qrCode: upiUri,
      status: "Pending",
    });    
    await newTransaction.save();

    // ✅ Update the order document with UPI transaction reference
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: { upiTransactionId: newTransaction._id, status: "UPI Initiated" } },
      { new: true }
    );

    res.json({ success: true, qrCode: base64Image });
  } catch (err) {
    console.error("Error in /initiate-upi:", err);
    res.status(500).json({
      success: false,
      message: "Error initiating UPI transaction: " + err.message,
    });
  }
});

/**
 * POST /complete-payment
 * Marks an order as paid and, if the payment was via UPI, updates related transaction statuses.
 */
router.post("/complete-payment", async (req, res) => {
  try {
    const { orderId, paymentMode, upiId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    order.status = "Paid";
    order.paymentMode = paymentMode;
    if (paymentMode === "UPI" && upiId) {
      order.upiId = upiId;
    }
    await order.save();

    // If payment was made using UPI, update the UPI transaction record(s)
    if (paymentMode === "UPI") {
      const updateResult = await UpiTransaction.updateMany(
        { orderId: orderId },
        { $set: { status: "Paid" } }
      );
      console.log(`Updated ${updateResult.modifiedCount} UPI transaction(s) to Paid for orderId: ${orderId}`);
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
