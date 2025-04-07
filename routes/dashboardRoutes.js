// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const Upi = require('../models/Upi');
const moment = require('moment');


// --- Login Routes ---
// Render login page
router.get('/login', (req, res) => {
  res.render('login');
});

// Login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    // Compare submitted password with hashed password in DB
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    // On success, save user info in session and redirect
    req.session.user = user;
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'An error occurred. Please try again.' });
  }
});

// Signup route
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Hash the password with a salt round of 10
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.redirect('/dashboard/login');
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'Error creating account. Please try again.' });
  }
});

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/dashboard/login');

  // Fetch pending orders
  const orders = await Order.find({ status: 'Pending' })
    .populate('items.foodItem')
    .exec();

  // Sum totals
  const allTotals = orders.reduce((acc, o) => {
    acc.total += o.totalAmount || 0;
    if (o.paymentMode === 'UPI') acc.upi += o.totalAmount || 0;
    else if (o.paymentMode === 'Cash') acc.cash += o.totalAmount || 0;
    return acc;
  }, { total: 0, upi: 0, cash: 0 });

  // Other data for rendering
  const foodItems  = await FoodItem.find().exec();
  const sections   = await FoodItem.distinct('section');
  const activeUpi  = await Upi.findOne({ active: true });

  res.render('dashboard', {
    user: req.session.user,
    orders,
    foodItems,
    sections,
    activeUpi,
    revenue: {
      total: allTotals.total,
      upi:   allTotals.upi,
      cash:  allTotals.cash
    }
  });
});

// Analytics page
router.get('/analytics', async (req, res) => {
  if (!req.session.user) 
    return res.redirect('/dashboard/login');

  // 1. parse date from query (default = today)
  const dateParam = req.query.date;
  const date = dateParam
    ? moment(dateParam, 'YYYY-MM-DD')
    : moment();

  // 2. build start/end of that day
  const start = date.clone().startOf('day').toDate();
  const end   = date.clone().endOf('day').toDate();

  // 3. Total revenue overall (Paid only)
  const totalAgg = await Order.aggregate([
    { $match: { status: 'Paid', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalRevenue = totalAgg[0]?.total || 0;

  // 4. Revenue by paymentMode
  const byModeAgg = await Order.aggregate([
    { $match: { status: 'Paid', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$paymentMode', revenue: { $sum: '$totalAmount' } } }
  ]);
  const revenueByMode = byModeAgg.reduce((acc, cur) => {
    acc[cur._id] = cur.revenue;
    return acc;
  }, { Cash: 0, UPI: 0 });

  // 5. UPI revenue per UPI ID, sorted desc
  const byUpiIdAgg = await Order.aggregate([
    { $match: { status: 'Paid', paymentMode: 'UPI', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$upiId', revenue: { $sum: '$totalAmount' } } },
    { $sort: { revenue: -1 } }
  ]);

  // 6. Low stock items (< 10)
  const lowStockItems = await FoodItem.find({ qty: { $lt: 10 } })
    .select('name qty price section')
    .lean();

  // 7. Build previous/next dates for nav
  const prevDate    = date.clone().subtract(1, 'day').format('YYYY-MM-DD');
  const nextDate    = date.clone().add(1, 'day').format('YYYY-MM-DD');
  const displayDate = date.format('DD MMM, YYYY');

  // 8. Render
  res.render('analytics', {
    user: req.session.user,
    totalRevenue,
    revenueByMode,
    upiById:       byUpiIdAgg,
    lowStockItems,
    prevDate,
    nextDate,
    displayDate,
    // for sidebar highlighting (you can leave empty or pass real data)
    sections:    await FoodItem.distinct('section'),
    foodItems:   [],
    activeUpi:   null
  });
});

router.put('/dashboard/fooditem/:id', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { id } = req.params;
  const { qty } = req.body;
  try {
    await FoodItem.findByIdAndUpdate(id, { qty });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Could not update qty' });
  }
});

// GET Settings Page - render settings view with UPI IDs
router.get('/settings', async (req, res) => {
  if (!req.session.user) return res.redirect('/dashboard/login');
  const upiIds = await Upi.find({}).exec();
  res.render('settings', { user: req.session.user, upiIds });
});

// Endpoint to add a new Food Item
router.post('/add-fooditem', async (req, res) => {
  const { name, section, subsection, price, imageUrl } = req.body;
  const foodItem = new FoodItem({ name, section, subsection, price, imageUrl });
  await foodItem.save();
  res.redirect('/dashboard');
});

// GET: show manage‑items page
router.get('/manage-items', async (req, res) => {
  if (!req.session.user) return res.redirect('/dashboard/login');
  const foodItems = await FoodItem.find({}).exec();
  res.render('manage-items', {
    user: req.session.user,
    foodItems
  });
});

// POST: update an existing item
router.post('/update-item', async (req, res) => {
  const { itemId, name, section, price, qty } = req.body;
  try {
    await FoodItem.findByIdAndUpdate(itemId, {
      name,
      section,
      price: parseFloat(price),
      qty: parseInt(qty, 10)
    });
    res.redirect('/dashboard/manage-items');
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST: delete an item
router.post('/delete-item', async (req, res) => {
  const { itemId } = req.body;
  try {
    await FoodItem.findByIdAndDelete(itemId);
    res.redirect('/dashboard/manage-items');
  } catch (err) {
    console.error('Delete item error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// View all paid orders in kitchen
router.get('/kitchen/orders', async (req, res) => {
  let orders = await Order.find({ status: 'Paid' })
    .populate('items.foodItem')
    .sort({ createdAt: -1 });

  // Create orderData fallback using populated data
  orders = orders.map(order => {
    const fallbackData = {};
    order.items.forEach(item => {
      const foodId = item.foodItem?._id?.toString?.() || item.foodItem?.toString?.();
      if (item.foodItem?.name) {
        fallbackData[foodId] = { name: item.foodItem.name };
      }
    });

    // Inject fallbackData into each order for use in EJS
    order.orderData = fallbackData;
    return order;
  });

  res.render('kitchen-orders', { orders });
});

// Endpoint to add a new UPI ID and set it active (first deactivate any active UPI)
router.post('/add-upi', async (req, res) => {
  const { upiId } = req.body;
  // Deactivate all currently active UPI IDs
  await Upi.updateMany({ active: true }, { $set: { active: false } });
  // Save new UPI and set it active
  const newUpi = new Upi({ upiId, active: true });
  await newUpi.save();
  res.redirect('/dashboard');
});

// Endpoint to set an existing UPI as active
router.post('/set-active-upi', async (req, res) => {
  const { upiRecordId } = req.body;
  await Upi.updateMany({ active: true }, { $set: { active: false } });
  await Upi.findByIdAndUpdate(upiRecordId, { active: true });
  res.redirect('/dashboard');
});

router.post('/delete-upi', async (req, res) => {
  const { upiRecordId } = req.body;
  const upi = await Upi.findById(upiRecordId);

  if (upi.active) {
    return res.status(400).send('Cannot delete the active UPI ID');
  }

  await Upi.findByIdAndDelete(upiRecordId);
  res.redirect('/dashboard');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/dashboard/login');
});

module.exports = router;
