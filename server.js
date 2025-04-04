//server.js
require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const os = require('os');
const pidusage = require('pidusage');
const si = require('systeminformation'); // For system-wide metrics

const orderRoutes = require('./routes/orderRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const upiTransactionRoutes = require('./routes/upiTransactionRoutes');
const csvtodataRoutes = require('./routes/csvtodata');

const app = express();

// Track server start time
const SERVER_START_TIME = Date.now();
let serverStatus = 'normal'; // "normal": all pages accessible, "restricted": only allowed pages, "offline": no pages (except API) available

// List of allowed URL patterns when in restricted mode.
// Allowed pages: orderForm.ejs, menu.ejs, success.ejs, and any dynamic orders/place URL.
const allowedPathsRestricted = [
  '/orders/new',
  '/orders/menu',      // allows any URL starting with /orders/menu
  '/orders/success',
  '/orders/place'
];

// Middleware to check server status and restrict access if necessary.
function restrictAccess(req, res, next) {
  // Always allow API endpoints
  if (req.originalUrl.startsWith('/api/')) return next();

  // If server is offline, render the offline page for all non-API routes.
  if (serverStatus === 'offline') {
    return res.render('offline'); // Create an offline.ejs view.
  }

  // If server is restricted, allow only certain pages.
  if (serverStatus === 'restricted') {
    const isAllowed = allowedPathsRestricted.some(prefix =>
      req.originalUrl.startsWith(prefix)
    );
    if (!isAllowed) {
      return res.render('notAllowed'); // Create a notAllowed.ejs view.
    }
  }
  next();
}

// Use session middleware
app.use(session({
  secret: process.env.SECRET_KEY || 'yourSecretKeyHere',
  resave: false,
  saveUninitialized: false,
}));

// Connect to MongoDB Atlas using MONGO_URI from .env
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply the restricted access middleware (apply before routes)
app.use(restrictAccess);

// Routes
app.use('/orders', orderRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/upi-transactions', upiTransactionRoutes);
app.use('/csvtodata', csvtodataRoutes);

// Home page (for demo, you can change it)
app.get('/', (req, res) => {
  res.redirect('/orders/new');
});

// API endpoint to update server status (e.g., normal, restricted, offline)
app.post('/api/update-server-status', (req, res) => {
  // Trim status to remove extra whitespace if any.
  serverStatus = req.body.status.trim();
  console.log('Server status updated to: ', serverStatus);
  res.sendStatus(200);
});

// API endpoint to fetch current server status (mode)
app.get('/api/status', async (req, res) => {
  try {
    // Calculate uptime
    const uptimeMs = Date.now() - SERVER_START_TIME;
    const uptimeStr = formatUptime(uptimeMs);

    // Get process-specific metrics (CPU and memory usage)
    const processStats = await pidusage(process.pid);

    // Get system-wide CPU usage
    const cpuData = await si.currentLoad();

    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Prepare response data
    const data = {
      system_metrics: {
        cpu_usage_percent: cpuData.currentLoad.toFixed(2),
        process: {
          cpu_usage_percent: processStats.cpu.toFixed(2),
          memory_usage_mb: (processStats.memory / (1024 ** 2)).toFixed(2)
        },
        memory: {
          total_gb: (totalMemory / (1024 ** 3)).toFixed(2),
          used_gb: (usedMemory / (1024 ** 3)).toFixed(2),
          usage_percent: ((usedMemory / totalMemory) * 100).toFixed(2)
        },
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        uptime: uptimeStr
      },
    };

    const response = {
      data: data,
      valid: true,
      message: "Server is running",
      mode: serverStatus
    };
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching server status:", error);
    res.status(500).json({
      valid: false,
      message: "Failed to fetch server status",
      error: error.message
    });
  }
});

// API endpoint to fetch the current mode
app.get('/api/mode', (req, res) => {
  res.status(200).json({ mode: serverStatus });
});

// Helper function to format uptime as HH:MM:SS
function formatUptime(uptimeMs) {
  const totalSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Start server
const PORT = process.env.PORT || 3035;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
