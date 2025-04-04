// routes/csvtodata.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const FoodItem = require('../models/FoodItem');

// Configure multer to save the uploaded file in the "uploads" directory
const upload = multer({ dest: 'uploads/' });

router.post('/upload-fooditems-csv', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csv({ mapHeaders: ({ header }) => header.trim() })) // Ensures correct header mapping
    .on('data', (data) => {
      console.log("Parsed row:", data); // Debugging
      results.push(data);
    })
    .on('end', async () => {
      try {
        for (const item of results) {
          // Skip the header row if it appears in the data
          if (item.name && item.name.trim().toLowerCase() === "name") {
            console.error("Skipping header row:", item);
            continue;
          }
          // Check required fields; if missing, skip the row
          if (!item.name || !item.price || !item.qty) {
            console.error("Skipping invalid row:", item);
            continue;
          }

          const newFoodItem = new FoodItem({
            name: item.name.trim(), // Use the value from CSV
            section: item.section ? item.section.trim() : '',
            subsection: item.subsection ? item.subsection.trim() : '',
            price: parseFloat(item.price),
            imageUrl: item.imageUrl ? item.imageUrl.trim() : '',
            qty: parseInt(item.qty, 10)
          });

          await newFoodItem.save();
        }
        fs.unlinkSync(req.file.path); // Remove the uploaded CSV file after processing
        res.redirect('/dashboard');
      } catch (error) {
        console.error("Error processing CSV: ", error);
        res.status(500).send("Error processing CSV file.");
      }
    })
    .on('error', (error) => {
      console.error("Error reading CSV file: ", error);
      res.status(500).send("Error reading CSV file.");
    });
});

module.exports = router;
