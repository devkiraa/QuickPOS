// app.js

const express = require('express');
const fs = require('fs');
const csvParser = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
    // Read items.csv and render dashboard
    const items = [];
    fs.createReadStream('items.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            items.push(row);
        })
        .on('end', () => {
            res.render('dashboard', { items });
        });
});

app.post('/submit', (req, res) => {
    // Handle item submission
    const { items, price, paymentMode, gpayName, gpayPhone } = req.body;

    // Process the submitted data (save to database, etc.)
    console.log('Submitted Items:', items);
    console.log('Total Price:', price);
    console.log('Payment Mode:', paymentMode);
    console.log('Google Pay Name:', gpayName);
    console.log('Google Pay Phone:', gpayPhone);

    // Prepare the transaction data for CSV
    let transaction = `${items},${price},${paymentMode},${gpayName},${gpayPhone}\n`;

    // Update export.csv with the transaction
    fs.appendFile('export.csv', transaction, (err) => {
        if (err) {
            console.error('Error writing to export.csv:', err);
            res.status(500).send('Error submitting items');
        } else {
            console.log('Items submitted successfully');
            res.send('Items submitted successfully');
        }
    });
});

// Route to fetch recent transactions
app.get('/recent-transactions', (req, res) => {
    // Read recent transactions from export.csv and send to client
    const transactions = [];
    fs.createReadStream('export.csv')
        .pipe(csvParser())
        .on('data', (row) => {
            transactions.push(row);
        })
        .on('end', () => {
            res.json(transactions);
        });
});

// Route to remove a specific transaction
app.post('/remove-transaction', (req, res) => {
    const { transaction } = req.body;
    // Read export.csv, remove the specified transaction, and rewrite the file
    const lines = fs.readFileSync('export.csv', 'utf-8').split('\n');
    const updatedLines = lines.filter(line => !line.includes(transaction));
    fs.writeFileSync('export.csv', updatedLines.join('\n'));
    res.send('Transaction removed successfully');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
