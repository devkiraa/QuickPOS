// routes/orderHelpers.js

const Order = require("../models/Order");
const UpiTransaction = require("../models/UpiTransaction");

/**
 * Generates the next sequential order number by looking up the latest order in the database.
 * If no order exists, it returns a starting number.
 */
async function generateNextOrderNumber() {
  const lastOrder = await Order.findOne({}).sort({ orderNumber: -1 });
  if (lastOrder && lastOrder.orderNumber) {
    return lastOrder.orderNumber + 1;
  }
  return 12345; // Starting order number if no previous orders exist
}

/**
 * Creates a new UPI transaction.
 * Constructs the UPI URI using the provided order details and saves the transaction record.
 *
 * @param {string} orderId - The unique order identifier.
 * @param {number} orderNumber - The sequential order number.
 * @param {string} upiId - The UPI identifier used for the payment.
 * @param {number} totalAmount - The total amount for the transaction.
 * @returns {Object} The created UPI transaction record.
 */
async function createUpiTransaction(orderId, orderNumber, upiId, totalAmount) {
  const payeeName = "Amrita Canteen";
  const amountStr = totalAmount.toFixed(2);
  const transactionNote = "Payment for Order #" + orderNumber;
  const tnParam = encodeURIComponent(transactionNote);
  const upiUri = `upi://pay?pa=${encodeURIComponent(
    upiId
  )}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(
    amountStr
  )}&tn=${tnParam}&cu=INR`;

  // Save the UPI transaction record with the generated UPI URI.
  const newTransaction = new UpiTransaction({
    orderId,
    orderNumber,
    upiId,
    qrCode: upiUri, // UPI URI saved as the QR code text.
    tn: transactionNote,
    status: "Pending",
  });
  await newTransaction.save();
  return newTransaction;
}

module.exports = { generateNextOrderNumber, createUpiTransaction };
