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

const app = express(); // Initialize the app before using it

// Track server start time
const SERVER_START_TIME = Date.now();
let serverStatus = 'online';

// Middleware to check server status and redirect if offline
function checkServerStatus(req, res, next) {
  // Exclude API routes from the offline check
  if (req.url.startsWith('/api/')) {
    return next(); // Skip the check for API routes
  }

  // Redirect to offline.ejs if serverStatus is "offline"
  if (serverStatus === 'offline') {
    return res.render('offline'); // Render the offline page
  }

  next(); // Proceed to the next middleware or route handler
}

// Session middleware
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

// Apply the server status middleware
app.use(checkServerStatus);

// Routes
app.use('/orders', orderRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/upi-transactions', upiTransactionRoutes);
// Home page (for demo, you can change it)
app.get('/', (req, res) => {
  res.redirect('/orders/new');
});

app.post('/api/update-server-status', (req, res) => {
  serverStatus = req.body.status;
  console.log('Server loaded with mode: ',serverStatus);
  res.sendStatus(200); // Use sendStatus instead of send
});

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
    const totalMemory = os.totalmem(); // Total memory in bytes
    const freeMemory = os.freemem(); // Free memory in bytes
    const usedMemory = totalMemory - freeMemory; // Used memory in bytes

    // Prepare response data
    const data = {
      system_metrics: {
        cpu_usage_percent: cpuData.currentLoad.toFixed(2), // Total CPU usage percentage
        process: {
          cpu_usage_percent: processStats.cpu.toFixed(2), // Process-specific CPU usage
          memory_usage_mb: (processStats.memory / (1024 ** 2)).toFixed(2) // Process-specific memory usage in MB
        },
        memory: {
          total_gb: (totalMemory / (1024 ** 3)).toFixed(2), // Total memory in GB
          used_gb: (usedMemory / (1024 ** 3)).toFixed(2), // Used memory in GB
          usage_percent: ((usedMemory / totalMemory) * 100).toFixed(2) // Memory usage percentage
        },
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), // Format as YYYY-MM-DD HH:MM:SS
        uptime: uptimeStr
      },
    };

    // Send response
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
