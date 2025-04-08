// routes/kitchenRoutes.js

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');

/**
 * GET /kitchen/orders
 * Show all paid orders in the kitchen view.
 */
router.get('/orders', async (req, res) => {
  try {
    let orders = await Order.find({ status: 'Paid' })
      .populate('items.foodItem')
      .sort({ createdAt: -1 });

    // Build fallbackData so that deleted items still show something
    orders = orders.map(order => {
      const fallbackData = {};
      order.items.forEach(item => {
        const foodId = item.foodItem?._id?.toString() || item.foodItem?.toString();
        if (item.foodItem?.name) {
          fallbackData[foodId] = { name: item.foodItem.name };
        }
      });
      order.orderData = fallbackData;
      return order;
    });

    res.render('kitchen-orders', { orders });
  } catch (err) {
    console.error('Error fetching kitchen orders:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /kitchen/complete
 * Mark an order as "Order Completed"
 */
router.post('/complete', async (req, res) => {
  const { orderId } = req.body;
  try {
    await Order.findByIdAndUpdate(orderId, { order_status: 'Order Completed' });
    res.redirect('/kitchen/orders');
  } catch (err) {
    console.error('Error marking order completed:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /kitchen/out-of-stock
 * Mark an order as "Out of Stock"
 */
router.post('/out-of-stock', async (req, res) => {
  const { orderId, outOfStockItems } = req.body;
  const items = Array.isArray(outOfStockItems)
    ? outOfStockItems
    : outOfStockItems
    ? [outOfStockItems]
    : [];

  try {
    // Mark the order as "Out of Stock"
    await Order.findByIdAndUpdate(orderId, {
      order_status: 'Out of Stock',
    });

    // Set qty of selected food items to 0
    await Promise.all(
      items.map(foodId =>
        FoodItem.findByIdAndUpdate(foodId, { qty: 0 })
      )
    );

    res.redirect('/kitchen/orders');
  } catch (err) {
    console.error('Error marking item/order out of stock:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/dashboard/delete-order', async (req, res) => { const { orderId } = req.body; try { await Order.findByIdAndDelete(orderId); res.redirect('/kitchen/orders'); } catch (err) { console.error('Error deleting order:', err); res.status(500).send('Internal Server Error'); } });

module.exports = router;
