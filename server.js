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

const onlineOrderRoutes = require("./routes/onlineOrderRoutes");
const posOrderRoutes = require("./routes/posOrderRoutes");
const commonRoutes = require("./routes/commonRoutes");
const dashboardRoutes = require('./routes/dashboardRoutes');
const upiTransactionRoutes = require('./routes/upiTransactionRoutes');
const csvtodataRoutes = require('./routes/csvtodata');
const apiRoutes = require('./routes/apiRoutes');

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
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));

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

// Home page (for demo, you can change it).
app.get('/', (req, res) => {
  res.redirect('/orders/new');
});

// Start server.
const PORT = process.env.PORT || 3035;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
