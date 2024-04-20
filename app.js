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
    fs.createReadStream('export.csv')
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

// Routes
app.get('/', (req, res) => {
    calculateSummary();
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

// Route to handle item submission
app.post('/submit', (req, res) => {
    // Handle item submission
    const { items, price, paymentMode, gpayName, gpayPhone } = req.body;

    // Prepare the transaction data for CSV
    let transactionItems = items.join(' - '); // Join items with hyphen
    let transaction = `${transactionItems},${price},${paymentMode},${gpayName || 'N/A'},${gpayPhone || 'N/A'}`;

    // Check if export.csv exists
    fs.access('export.csv', fs.constants.F_OK, (err) => {
        if (err) {
            // If export.csv does not exist, write the transaction data directly
            fs.writeFile('export.csv', transaction + '\n', (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    console.log('Items submitted successfully');
                    res.send('Items submitted successfully');
                    calculateSummary();
                }
            });
        } else {
            // If export.csv exists, append the transaction data to the file
            fs.appendFile('export.csv', '\n' + transaction, (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    console.log('Items submitted successfully');
                    res.send('Items submitted successfully');
                    calculateSummary();
                }
            });
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
            res.json(transactions.slice(-5)); // Get the latest 5 transactions
        });
});
// Route to delete the latest transaction
app.post('/delete-latest-transaction', (req, res) => {
    // Read export.csv, remove the last transaction, and rewrite the file
    const lines = fs.readFileSync('export.csv', 'utf-8').trim().split('\n');
    lines.pop(); // Remove the last line (latest transaction)
    fs.writeFileSync('export.csv', lines.join('\n'));
    console.log('Latest transaction deleted');
    res.send('Latest transaction deleted successfully');
});


// Route to get summary
app.get('/summary', (req, res) => {
    const summary = JSON.parse(fs.readFileSync('summary.json'));
    res.json(summary);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
