// app.js

const express = require('express');
const fs = require('fs');
const csvParser = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Function to calculate summary
function calculateSummary() {
    let gpayAmount = 0;
    let cashAmount = 0;
    fs.createReadStream('data/export.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            if (row['Payment Mode'] === 'gpay') {
                gpayAmount += parseFloat(row['Price']);
            } else {
                cashAmount += parseFloat(row['Price']);
            }
        })
        .on('end', () => {
            fs.writeFileSync('summary.json', JSON.stringify({ gpayAmount, cashAmount }));
        });
}

// Function to generate a unique order ID
function generateOrderId() {
    return Math.floor(Math.random() * 1000000); // Simple random order ID generation
}

// Routes
app.get('/', (req, res) => {
    calculateSummary();
    // Read items.csv and render dashboard
    const items = [];
    fs.createReadStream('data/items.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            items.push(row);
        })
        .on('end', () => {
            res.render('dashboard', { items });
        });
});

// Route to handle item submission
app.post('/submit', (req, res) => {
    // Handle item submission
    const { items, price, paymentMode, gpayName, gpayPhone } = req.body;

    // Generate a unique order ID
    const orderId = generateOrderId();

    // Prepare the transaction data for CSV
    let transactionItems = items.join(' - '); // Join items with hyphen
    let transaction = `${orderId},${transactionItems},${price},${paymentMode},${gpayName || 'N/A'},${gpayPhone || 'N/A'}`;

    // Check if export.csv exists
    fs.access('data/export.csv', fs.constants.F_OK, (err) => {
        if (err) {
            // If export.csv does not exist, write the transaction data directly
            fs.writeFile('data/export.csv', transaction + '\n', (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    console.log(gpayName+' have ordered an item');//Items submitted successfully
                    res.send(gpayName+' have ordered an item');//Items submitted successfully
                    calculateSummary();
                }
            });
        } else {
            // If export.csv exists, append the transaction data to the file
            fs.appendFile('data/export.csv', '\n' + transaction, (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    console.log(gpayName+' have ordered an item');//Items submitted successfully
                    res.send(gpayName+' have ordered an item');//Items submitted successfully
                    calculateSummary();
                }
            });
        }
    });

    // Prepare the order data for CSV
    let orderData = `${orderId},${transactionItems},${gpayName || 'N/A'},Not Completed`;

    // Append the order data to orders.csv
    fs.appendFile('data/orders.csv', '\n' + orderData, (err) => {
        if (err) {
            console.error('Error writing to orders.csv:', err);
        } else {
            console.log('Order details updated in orders.csv');
        }
    });
});

// Route to display orders
app.get('/orders', (req, res) => {
    // Read orders from orders.csv and render orders page
    const orders = [];
    fs.createReadStream('data/orders.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            orders.push(row);
        })
        .on('end', () => {
            // Filter out completed orders
            const filteredOrders = orders.filter(order => order['Status'] !== 'Completed');
            res.render('orders', { orders: filteredOrders });
        });
});

// Route to handle item submission
// Route to handle item submission
app.post('/submit', (req, res) => {
    // Handle item submission
    const { items, price, paymentMode, gpayName, gpayPhone } = req.body;

    // Generate a unique order ID
    const orderId = generateOrderId();

    // Prepare the transaction items
    const transactionItems = items.join(' - ');

    // Prepare the order data for CSV
    const orderData = `${orderId},${transactionItems},${gpayName || 'N/A'},Not Completed`;

    // Append the order data to orders.csv
    fs.appendFile('data/orders.csv', '\n' + orderData, (err) => {
        if (err) {
            console.error('Error writing to orders.csv:', err);
            res.status(500).send('Error submitting items');
        } else {
            console.log('Order details updated in orders.csv');

            // Prepare the transaction data for CSV
            const transaction = `${orderId},${transactionItems},${price},${paymentMode},${gpayName || 'N/A'},${gpayPhone || 'N/A'}`;

            // Check if export.csv exists
            fs.access('data/export.csv', fs.constants.F_OK, (err) => {
                if (err) {
                    // If export.csv does not exist, write the transaction data directly
                    fs.writeFile('data/export.csv', transaction + '\n', (err) => {
                        if (err) {
                            console.error('Error writing to export.csv:', err);
                        } else {
                            console.log('Items submitted successfully');
                            calculateSummary();
                        }
                    });
                } else {
                    // If export.csv exists, append the transaction data to the file
                    fs.appendFile('export.csv', '\n' + transaction, (err) => {
                        if (err) {
                            console.error('Error writing to export.csv:', err);
                        } else {
                            console.log('Items submitted successfully');
                            calculateSummary();
                        }
                    });
                }
            });

            res.send('Items submitted successfully');
        }
    });
});

// Route to fetch recent transactions
app.get('/recent-transactions', (req, res) => {
    // Read recent transactions from export.csv and send the last 10 transactions to client
    const transactions = [];
    fs.createReadStream('data/export.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            transactions.push(row);
        })
        .on('end', () => {
            const lastTenTransactions = transactions.slice(-10); // Limit to last 10 transactions
            res.json(lastTenTransactions);
        });
});


// Route to mark an order as complete
app.post('/complete-order', (req, res) => {
    const orderId = req.body.orderId;
    const orders = [];

    // Read orders from orders.csv and update the status of the specified order
    fs.createReadStream('data/orders.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            // Update the status of the order with the specified orderId
            if (row['Order ID'] === orderId) {
                row['Status'] = 'Completed';
            }
            orders.push(row);
        })
        .on('end', () => {
            // Rewrite orders.csv with updated orders
            const writer = fs.createWriteStream('data/orders.csv');
            writer.write('Order ID,Items,GPAY Name,Status\n'); // Write the header
            orders.forEach((order) => {
                writer.write(`${order['Order ID']},${order['Items']},${order['GPAY Name']},${order['Status']}\n`);
            });
            writer.end();
            console.log(`Order ${orderId} marked as completed`);
            res.json({ success: true });
        });
});

// Function to calculate summary
function calculateSummary() {
    let gpayAmount = 0;
    let cashAmount = 0;
    fs.createReadStream('data/export.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            const paymentMode = row['Payment Mode'];
            const price = parseFloat(row['Price']);
            if (paymentMode === 'gpay') {
                gpayAmount += price;
            } else if (paymentMode === 'cash') {
                cashAmount += price;
            }
        })
        .on('end', () => {
            // Write summary to summary.json
            fs.writeFile('summary.json', JSON.stringify({ gpayAmount, cashAmount }), (err) => {
                if (err) {
                    console.error('Error writing summary:', err);
                } else {
                    console.log('---------------------------');//Summary updated successfully
                }
            });
        });
}


// Route to fetch summary
// Route to fetch summary
app.get('/summary', (req, res) => {
    // Read summary from summary.json and send to client
    const summaryData = JSON.parse(fs.readFileSync('summary.json', 'utf-8'));
    res.json(summaryData);
});



// Route to delete the latest transaction
app.post('/delete-latest-transaction', (req, res) => {
    // Read export.csv, remove the last transaction, and rewrite the file
    const lines = fs.readFileSync('data/export.csv', 'utf-8').trim().split('\n');
    lines.pop(); // Remove the last line (latest transaction)
    fs.writeFileSync('data/export.csv', lines.join('\n'));
    console.log('Latest transaction deleted');
    res.send('Latest transaction deleted successfully');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
