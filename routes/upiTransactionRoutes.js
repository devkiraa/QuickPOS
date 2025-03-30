// routes/upiTransactionRoutes.js
const express = require('express');
const router = express.Router();
const UpiTransaction = require('../models/UpiTransaction');

// GET: Fetch the latest 5 UPI transactions
router.get('/all', async (req, res) => {
  try {
    const transactions = await UpiTransaction.find({})
      .sort({ createdAt: -1 })
      .limit(5);
    res.json({ success: true, transactions });
  } catch (err) {
    console.error("Error fetching UPI transactions:", err);
    res.status(500).json({ success: false, message: "Error fetching UPI transactions" });
  }
});

module.exports = router;
