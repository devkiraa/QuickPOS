// routes/onlineOrderRoutes.js

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const Order = require("../models/Order");
const FoodItem = require("../models/FoodItem");
const { generateNextOrderNumber } = require("./orderHelpers");

/**
 * GET /new
 * Renders the order form to collect customer details for an online order.
 */
router.get("/new", (req, res) => {
  res.render("orderForm");
});

/**
 * POST /new
 * Creates a new online order with a unique orderId (UUID) and sequential orderNumber.
 * Then redirects to the menu page for that order.
 */
router.post("/new", async (req, res) => {
  try {
    const { customerName, mobile } = req.body;
    // Generate a unique order ID for online orders.
    const orderId = uuidv4();
    // Generate the next sequential order number.
    const orderNumber = await generateNextOrderNumber();
    // Create a new order document.
    const newOrder = new Order({
      orderId,
      orderNumber,
      customerName,
      mobile,
      items: [],
      totalAmount: 0,
      status: "Pending",
      orderSource: "online",
    });
    await newOrder.save();
    // Redirect to the menu page for the newly created order.
    res.redirect(`/orders/menu/${orderId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating new online order");
  }
});

/**
 * GET /menu/:orderId
 * Loads the menu page for the online order with all available food items.
 */
router.get("/menu/:orderId", async (req, res) => {
  try {
    // Retrieve all food items and distinct sections for display.
    const foodItems = await FoodItem.find({});
    const sections = await FoodItem.distinct("section");
    res.render("menu", { orderId: req.params.orderId, foodItems, sections });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading menu");
  }
});

/**
 * POST /place/:orderId
 * Processes the order submission from the online menu.
 * Parses the JSON sent from the client, calculates the total amount, and saves the order.
 */
router.post("/place/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    let itemsData;
    try {
      // Parse the order items from the request body.
      itemsData = JSON.parse(req.body.items);
    } catch (e) {
      return res.status(400).send("Invalid JSON for items");
    }
    const itemsArray = [];
    let totalAmount = 0;
    // Loop through each item to calculate total and prepare item details.
    for (const item of itemsData) {
      totalAmount += item.price * item.quantity;
      itemsArray.push({
        foodItem: item.id, // FoodItem _id as string.
        quantity: item.quantity,
      });
    }
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).send("Order not found");
    }
    // Update order with items and total amount.
    order.items = itemsArray;
    order.totalAmount = totalAmount;
    await order.save();
    // Redirect to the success page after placing the order.
    res.redirect("/orders/success?orderId=" + orderId);
  } catch (err) {
    console.error("Error placing online order:", err);
    res.status(500).send("Error placing online order");
  }
});

module.exports = router;
