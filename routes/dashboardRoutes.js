// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const Upi = require('../models/Upi');

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
    const orders = await Order.find({ status: 'Pending' }).populate('items.foodItem').exec();
    const foodItems = await FoodItem.find({}).exec();
    const upiIds = await Upi.find({}).exec();
    const sections = await FoodItem.distinct("section");
    const activeUpi = await Upi.findOne({ active: true });  // Fetch the active UPI
  
    let selectedItems = [];
    if (orders.length > 0) {
      selectedItems = orders[0].items; // or choose a specific order
    }
    
    res.render('dashboard', { orders, foodItems, upiIds, user: req.session.user, selectedItems, sections, activeUpi });
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

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/dashboard/login');
});

module.exports = router;
