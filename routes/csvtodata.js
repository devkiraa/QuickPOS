//routes/csvtodata.js
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
        if (!item.name || !item.price || !item.qty) {
          console.error("Skipping invalid row:", item);
          continue; // Skip rows with missing data
        }

        const newFoodItem = new FoodItem({
          name: item.name.trim(),
          section: item.section.trim(),
          subsection: item.subsection ? item.subsection.trim() : '',
          price: parseFloat(item.price),
          imageUrl: item.imageUrl.trim(),
          qty: parseInt(item.qty, 10)
        });

        await newFoodItem.save();
      }
      fs.unlinkSync(req.file.path);
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
