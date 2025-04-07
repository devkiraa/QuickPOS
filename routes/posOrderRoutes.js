// routes/posOrderRoutes.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const Order = require("../models/Order");
const Upi = require("../models/Upi");
const {
  generateNextOrderNumber,
  createUpiTransaction,
} = require("./orderHelpers");

/**
 * POST /place-pos
 * Processes POS orders coming from either the counter or online POS channels.
 */
router.post("/place-pos", async (req, res) => {
  try {
    const { paymentMode, upiId, orderItems, orderSource } = req.body;

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
      return res
        .status(400)
        .json({ success: false, message: "Invalid JSON for order items" });
    }

    // Turn object-of-objects or array into [{ id, price, quantity }, …]
    const itemsData = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([id, item]) => ({ id, ...item }));

    // 3) Build items array and compute total
    const itemsArray = [];
    let totalAmount = 0;

    for (const item of itemsData) {
      if (!item.id || item.quantity == null || item.price == null) {
        return res
          .status(400)
          .json({ success: false, message: "Each item must have id, price, quantity" });
      }
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        // <-- use `new` here:
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity,
      });
    }

    // 4) Resolve UPI defaults
    let finalPaymentMode =
      orderSource === "counter" && !paymentMode ? "Cash" : paymentMode;
    let finalUpiId = upiId;
    if (finalPaymentMode === "UPI" && !finalUpiId) {
      const active = await Upi.findOne({ active: true });
      if (!active?.upiId) {
        return res
          .status(400)
          .json({ success: false, message: "Active UPI account not set." });
      }
      finalUpiId = active.upiId;
    }

    // 5) Create & save order
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName: "POS Customer",
      mobile: "N/A",
      items: itemsArray,
      paymentMode: finalPaymentMode,
      upiId: finalPaymentMode === "UPI" ? finalUpiId : "",
      totalAmount,
      status: finalPaymentMode === "Cash" ? "Paid" : "Pending",
      order_status: finalPaymentMode === "Cash" ? "Preparing" : "Pending",
      orderSource: orderSource || "counter",
    });
    await newOrder.save();

    // 6) Kick off UPI transaction if needed
    if (finalPaymentMode === "UPI") {
      await createUpiTransaction(
        orderId,
        orderNumber,
        finalUpiId,
        totalAmount
      );
    }

    // 7) Respond
    res.json({ success: true, orderId, orderNumber });
  } catch (err) {
    console.error("Error in place-pos endpoint:", err);
    res.status(500).json({
      success: false,
      message: "Error placing POS order: " + err.message,
    });
  }
});

module.exports = router;
