// models/FoodItem.js
const mongoose = require('mongoose');

const FoodItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  section: { type: String, required: true }, // e.g., "Drinks", "Snacks"
  subsection: { type: String }, // optional e.g., "Cold Drinks"
  price: { type: Number, required: true },
  imageUrl: { type: String }, // URL or relative path to the image
});

module.exports = mongoose.model('FoodItem', FoodItemSchema);
