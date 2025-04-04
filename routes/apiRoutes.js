// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const os = require('os');
const pidusage = require('pidusage');
const si = require('systeminformation'); // For system-wide metrics

/**
 * POST /api/update-server-status
 * Expected body: { "status": "online" } or { "status": "offline" }
 * Updates the current server status.
 */
router.post('/update-server-status', (req, res) => {
  const newStatus = req.body.status && req.body.status.trim().toLowerCase();
  if (newStatus !== 'online' && newStatus !== 'offline') {
    return res
      .status(400)
      .json({ valid: false, message: 'Invalid status. Only "online" or "offline" allowed.' });
  }
  // Update the serverStatus via the setter function provided in app.locals.
  req.app.locals.setServerStatus(newStatus);
  console.log('Server status updated to:', req.app.locals.getServerStatus());
  res.sendStatus(200);
});

/**
 * GET /api/status
 * Returns system metrics along with the current server status ("online" or "offline").
 */
router.get('/status', async (req, res) => {
  try {
    // Retrieve the server start time from app.locals.
    const SERVER_START_TIME = req.app.locals.SERVER_START_TIME;
    // Calculate uptime.
    const uptimeMs = Date.now() - SERVER_START_TIME;
    const uptimeStr = formatUptime(uptimeMs);

    // Get process-specific metrics (CPU and memory usage).
    const processStats = await pidusage(process.pid);

    // Get system-wide CPU usage.
    const cpuData = await si.currentLoad();

    // Get memory usage.
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Prepare response data.
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
      }
    };

    const response = {
      data: data,
      valid: true,
      message: "Server is running",
      status: req.app.locals.getServerStatus()
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

/**
 * GET /api/mode
 * Returns the current server status ("online" or "offline").
 */
router.get('/mode', (req, res) => {
  res.status(200).json({ status: req.app.locals.getServerStatus() });
});

/**
 * Helper function to format uptime (in milliseconds) as HH:MM:SS.
 * @param {number} uptimeMs - Uptime in milliseconds.
 * @returns {string} Formatted uptime string.
 */
function formatUptime(uptimeMs) {
  const totalSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

module.exports = router;
