// routes/workerRoutes.js
const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');

// Add a new worker
router.post('/add', async (req, res) => {
  const { name, role, contact } = req.body;
  const worker = new Worker({ name, role, contact });
  await worker.save();
  res.json({ message: 'Worker added successfully', worker });
});

// Get all workers
router.get('/', async (req, res) => {
  const workers = await Worker.find({});
  res.json(workers);
});

module.exports = router;
