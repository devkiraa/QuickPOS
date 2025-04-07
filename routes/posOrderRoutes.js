// routes/posOrderRoutes.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const Order = require("../models/Order");
const FoodItem = require("../models/FoodItem");
const Upi = require("../models/Upi");
const {
  generateNextOrderNumber,
  createUpiTransaction,
} = require("./orderHelpers");

/**
 * POST /place-pos
 * Processes POS orders coming from either the counter or online POS channels,
 * validates & decrements stock, and optionally initiates UPI.
 */
router.post("/place-pos", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentMode, upiId, orderItems, orderSource,customerName,mobile } = req.body;
    if (!customerName || !mobile) {
     throw new Error("Customer name and mobile are required");
    }
    // 1) Determine orderId and orderNumber
    let orderId, orderNumber;
    if (orderSource === "counter") {
      orderNumber = await generateNextOrderNumber();
      orderId = "#" + orderNumber;
    } else {
      orderId = uuidv4();
      orderNumber = await generateNextOrderNumber();
    }

    // 2) Parse and normalize order items
    let parsed;
    try {
      parsed =
        typeof orderItems === "string"
          ? JSON.parse(orderItems)
          : orderItems;
    } catch (e) {
      throw new Error("Invalid JSON for order items");
    }
    const itemsData = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([id, item]) => ({ id, ...item }));

    if (itemsData.length === 0) {
      throw new Error("No items in the order");
    }

    // 3) Fetch current stock & validate
    const ids = itemsData.map(i => i.id);
    const foods = await FoodItem.find({ _id: { $in: ids } }).session(session);
    const stockMap = foods.reduce((m, f) => {
      m[f._id.toString()] = f.qty;
      return m;
    }, {});

    for (const item of itemsData) {
      if (!stockMap[item.id]) {
        throw new Error(`Item ${item.id} not found or out of stock`);
      }
      if (stockMap[item.id] < item.quantity) {
        throw new Error(
          `Insufficient stock for item ${item.id}: have ${stockMap[item.id]}, need ${item.quantity}`
        );
      }
    }

    // 4) Build items array and compute total
    const itemsArray = [];
    let totalAmount = 0;
    for (const item of itemsData) {
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity,
      });
    }

    // 5) Resolve UPI defaults
    let finalPaymentMode =
      orderSource === "counter" && !paymentMode ? "Cash" : paymentMode;
    let finalUpiId = upiId;
    if (finalPaymentMode === "UPI" && !finalUpiId) {
      const active = await Upi.findOne({ active: true }).session(session);
      if (!active?.upiId) {
        throw new Error("Active UPI account not set.");
      }
      finalUpiId = active.upiId;
    }

    // 6) Create & save order
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName,
      mobile,
      items: itemsArray,
      paymentMode: finalPaymentMode,
      upiId: finalPaymentMode === "UPI" ? finalUpiId : "",
      totalAmount,
      status: finalPaymentMode === "Cash" ? "Paid" : "Pending",
      order_status: "Preparing",
      orderSource: orderSource || "counter",
    });
    await newOrder.save({ session });

    // 7) Decrement stock
    const bulkOps = itemsData.map(item => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $inc: { qty: -item.quantity } }
      }
    }));
    await FoodItem.bulkWrite(bulkOps, { session });

    // 8) Kick off UPI transaction if needed
    if (finalPaymentMode === "UPI") {
      await createUpiTransaction(
        orderId,
        orderNumber,
        finalUpiId,
        totalAmount
      );
    }

    // 9) Commit
    await session.commitTransaction();
    session.endSession();

    // 10) Respond
    res.json({ success: true, orderId, orderNumber });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in place-pos endpoint:", err);
    res.status(400).json({
      success: false,
      message: err.message.startsWith("Insufficient")
        ? err.message
        : "Error placing POS order: " + err.message,
    });
  }
});

module.exports = router;
