// server.js
require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const os = require('os');
const pidusage = require('pidusage');
const si = require('systeminformation'); // For system-wide metrics
const cron = require('node-cron');
const Order = require('./models/Order');

const onlineOrderRoutes = require("./routes/onlineOrderRoutes");
const posOrderRoutes = require("./routes/posOrderRoutes");
const commonRoutes = require("./routes/commonRoutes");
const dashboardRoutes = require('./routes/dashboardRoutes');
const upiTransactionRoutes = require('./routes/upiTransactionRoutes');
const csvtodataRoutes = require('./routes/csvtodata');
const apiRoutes = require('./routes/apiRoutes');
const kitchenRoutes = require('./routes/kitchenRoutes');

const app = express();

// Track server start time
const SERVER_START_TIME = Date.now();
// Server status can only be "online" or "offline"
let serverStatus = 'online';

// Attach global variables and helper functions to app.locals for access in routes.
app.locals.SERVER_START_TIME = SERVER_START_TIME;
app.locals.getServerStatus = () => serverStatus;
app.locals.setServerStatus = (newStatus) => { serverStatus = newStatus; return serverStatus; };

/**
 * Middleware to check server status.
 * If the server status is "offline", render the offline page.
 * Otherwise, allow all routes.
 */
function restrictAccess(req, res, next) {
  // Always allow API endpoints.
  if (req.originalUrl.startsWith('/api/')) return next();

  // If server is offline, render the offline page for all non-API routes.
  if (serverStatus === 'offline') {
    return res.render('offline'); // Ensure you have an offline.ejs view.
  }
  next();
}

// Use session middleware.
app.use(session({
  secret: process.env.SECRET_KEY || 'yourSecretKeyHere',
  resave: false,
  saveUninitialized: false,
}));

// Connect to MongoDB Atlas using MONGO_URI from .env.
mongoose.connect(process.env.MONGO_URI);
mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Log successful connection to MongoDB Atlas.
mongoose.connection.once('open', () => {
  console.log('Successfully connected to MongoDB Atlas.');
});

// Set EJS as templating engine.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply the restricted access middleware (applies before routes).
app.use(restrictAccess);

// Routes.
app.use("/orders", onlineOrderRoutes);
app.use("/orders", posOrderRoutes);
app.use("/orders", commonRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/upi-transactions', upiTransactionRoutes);
app.use('/csvtodata', csvtodataRoutes);
app.use('/api', apiRoutes); // Mount API routes under /api.
app.use('/kitchen', kitchenRoutes);

// Home page (for demo, you can change it).
app.get('/', (req, res) => {
  res.redirect('/orders/new');
});

cron.schedule('*/1 * * * *', async () => { // runs every 2 minutes
  try {
    const cutoff = new Date(Date.now() - 7 * 60 * 1000); // 7 minutes ago

    const result = await Order.deleteMany({
      status: 'Pending',
      order_status: 'Preparing',
      orderSource: 'online',
      totalAmount: 0,
      items: { $size: 0 },
      createdAt: { $lt: cutoff }
    });

    if (result.deletedCount > 0) {
      console.log(`[${new Date().toLocaleString()}] Auto-cleaned ${result.deletedCount} stale online orders.`);
    }
  } catch (err) {
    console.error('Auto-cleanup error:', err);
  }
});
app.get('/dashboard/ads', (req, res) => {
  res.render('ads', { ads }); // assuming 'ads.ejs' is the page filename
});
const ads = [
  {
    title: '20% Off on Beverages!',
    description: 'Enjoy a refreshing drink with every order. Limited time offer.',
    imageUrl: 'https://149367133.v2.pressablecdn.com/wp-content/uploads/2023/09/pubg-kfc-collab-20230928.jpg',
    expiry: '2025-05-01'
  },
  {
    title: 'Try Our New Burger',
    description: 'Introducing spicy cheese burst burger at ₹99 only!',
    imageUrl: 'https://ascentialcdn.filespin.io/api/v1/conversion/8ac687c6ea0b4a468c7bec094a522806',
    expiry: '2025-04-15'
  }
];

// Start server.
const PORT = process.env.PORT || 3035;
const server = app.listen(PORT, () => {
  const startTime = new Date(SERVER_START_TIME).toLocaleString();
  const environment = process.env.NODE_ENV || 'development';
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the website at: http://localhost:${PORT}`);
  console.log(`Server started at: ${startTime}`);
  console.log(`Environment: ${environment}`);
  console.log(`Process ID: ${process.pid}`);
});

