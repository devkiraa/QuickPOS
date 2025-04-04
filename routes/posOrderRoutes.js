// routes/posOrderRoutes.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const Order = require("../models/Order");
const Upi = require("../models/Upi");
const { generateNextOrderNumber, createUpiTransaction } = require("./orderHelpers");

/**
 * POST /place-pos
 * Processes POS orders coming from either the counter or online POS channels.
 * It handles order ID generation, item parsing, total calculation, and UPI payment processing.
 */
router.post("/place-pos", async (req, res) => {
  try {
    const { paymentMode, upiId, orderItems, orderSource } = req.body;
    let orderId;
    // For counter orders, generate a sequential order number prefixed with '#' 
    // Otherwise, for online POS orders, use a UUID.
    if (orderSource === "counter") {
      const orderNumber = await generateNextOrderNumber();
      orderId = "#" + orderNumber;
    } else {
      orderId = uuidv4();
    }
    let parsedOrderItems;
    try {
      // Parse order items, which could be a stringified JSON.
      parsedOrderItems =
        typeof orderItems === "string" ? JSON.parse(orderItems) : orderItems;
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid JSON for order items" });
    }
    let totalAmount = 0;
    const itemsArray = [];
    // Loop through the items to calculate total amount and create an items array.
    for (const key in parsedOrderItems) {
      const item = parsedOrderItems[key];
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: new mongoose.Types.ObjectId(item.id),
        quantity: item.quantity,
      });
    }
    // Generate a sequential order number for POS orders.
    const orderNumber = await generateNextOrderNumber();

    // Determine payment mode. Default to "Cash" for counter orders if none provided.
    let finalPaymentMode =
      orderSource === "counter" && !paymentMode ? "Cash" : paymentMode;
    let finalUpiId = upiId;
    // If UPI payment is selected but no UPI id is provided, retrieve the active UPI account.
    if (finalPaymentMode === "UPI" && !upiId) {
      const activeUpiDoc = await Upi.findOne({ active: true });
      if (activeUpiDoc && activeUpiDoc.upiId) {
        finalUpiId = activeUpiDoc.upiId;
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Active UPI account not set." });
      }
    }

    // Create a new order document with the calculated details.
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName: "POS Customer",
      mobile: "N/A",
      items: itemsArray,
      orderData: parsedOrderItems,
      paymentMode: finalPaymentMode,
      upiId: finalPaymentMode === "UPI" ? finalUpiId : "",
      totalAmount,
      status: "Pending",
      orderSource: orderSource || "counter",
    });
    await newOrder.save();

    // If UPI is the chosen payment mode, generate a UPI QR code and create a transaction record.
    if (finalPaymentMode === "UPI") {
      const transaction = await createUpiTransaction(
        orderId,
        orderNumber,
        finalUpiId,
        totalAmount
      );
      // Optionally, you can include the transaction details in the response.
    }

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
