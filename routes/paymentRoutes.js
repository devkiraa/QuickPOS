// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Record a payment (for cash or UPI)
router.post('/record', async (req, res) => {
  const { orderId, amount, mode, upiId } = req.body;
  const payment = new Payment({ orderId, amount, mode, upiId });
  await payment.save();
  res.json({ message: 'Payment recorded', payment });
});

// Generate PDF report for a given UPI id
router.get('/report/:upiId', async (req, res) => {
  const { upiId } = req.params;
  const payments = await Payment.find({ upiId });

  // Create PDF
  const doc = new PDFDocument();
  const filePath = path.join(__dirname, `../reports/${upiId}_report.pdf`);
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(18).text(`Payment Report for UPI: ${upiId}`, { underline: true });
  doc.moveDown();

  payments.forEach(payment => {
    doc.fontSize(12).text(`Order ID: ${payment.orderId} | Amount: ${payment.amount} | Mode: ${payment.mode} | Received: ${payment.receivedAt}`);
    doc.moveDown();
  });
  doc.end();

  // Once the PDF is generated, send it back
  doc.on('finish', () => {
    res.download(filePath);
  });
});

module.exports = router;
