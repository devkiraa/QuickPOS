  // models/FoodItem.js
  const mongoose = require('mongoose');

  const FoodItemSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    section: { type: String, required: true, index: true }, // e.g., "Drinks", "Snacks"
    subsection: { type: String }, // optional e.g., "Cold Drinks"
    price: { type: Number, required: true },
    imageUrl: { type: String }, // URL or relative path to the image
    qty: { type: Number, default: 0 }  // new quantity field
  }, { timestamps: true });

  module.exports = mongoose.model('FoodItem', FoodItemSchema);
