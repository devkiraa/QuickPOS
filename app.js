const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const csvParser = require('csv-parser');
const session = require('express-session');
const xml2js = require('xml2js');

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new xml2js.Parser();
const builder = new xml2js.Builder();

// Set up middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));
app.use('/images', express.static(path.join(__dirname, 'data/users/images')));
app.set('view engine', 'ejs');

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.session.username;
        const userDir = path.join(__dirname, `data/users/${username}/images`);
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Function to create necessary directories and files for a user
function initializeUserDirectory(username) {
    const userDir = path.join(__dirname, `data/users/${username}`);
    const imageDir = path.join(userDir, 'images');
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir);
    }
    const files = {
        'items.csv': 'item_name,item_price,item_type,item_image\n',
        'orders.csv': 'Order ID,Items,GPAY Name,Status\n',
        'export.csv': 'Order ID,Items,Price,Payment Mode,GPAY Name,Phone No\n',
        'summary.json': JSON.stringify({ gpayAmount: 0, cashAmount: 0 }),
        'userdata.csv': 'username,email,phone\n'
    };
    for (const [file, content] of Object.entries(files)) {
        const filePath = path.join(userDir, `${username}_${file}`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, content);
        }
    }
}

// Function to calculate summary
function calculateSummary(username) {
    let gpayAmount = 0;
    let cashAmount = 0;
    const exportPath = path.join(__dirname, `data/users/${username}/${username}_export.csv`);
    fs.createReadStream(exportPath)
        .pipe(csvParser())
        .on('data', (row) => {
            if (row['Payment Mode'] === 'gpay') {
                gpayAmount += parseFloat(row['Price']);
            } else {
                cashAmount += parseFloat(row['Price']);
            }
        })
        .on('end', () => {
            fs.writeFileSync(path.join(__dirname, `data/users/${username}/${username}_summary.json`), JSON.stringify({ gpayAmount, cashAmount }));
        });
}

// Function to generate a unique order ID
function generateOrderId() {
    return Math.floor(Math.random() * 1000000); // Simple random order ID generation
}

// Function to authenticate user by email and password
function authenticateUser(email, password, callback) {
    fs.readFile('data/users.xml', (err, data) => {
        if (err) throw err;
        parser.parseString(data, (err, result) => {
            if (err) throw err;
            const users = result.users.user;
            const user = users.find(user => user.email[0] === email && user.password[0] === password);
            callback(user);
        });
    });
}

// Function to register user
function registerUser(username, email, password, callback) {
    fs.readFile('data/users.xml', (err, data) => {
        if (err) throw err;
        parser.parseString(data, (err, result) => {
            if (err) throw err;
            const users = result.users.user;
            const userExists = users.some(user => user.email[0] === email);
            if (userExists) {
                callback(false);
            } else {
                result.users.user.push({ username: [username], email: [email], password: [password] });
                const xml = builder.buildObject(result);
                fs.writeFile('data/users.xml', xml, (err) => {
                    if (err) throw err;
                    initializeUserDirectory(username);
                    callback(true);
                });
            }
        });
    });
}

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
    if (req.session.username) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    authenticateUser(email, password, (user) => {
        if (user) {
            req.session.username = user.username[0];
            initializeUserDirectory(user.username[0]);
            res.redirect('/');
        } else {
            res.send('Invalid email or password');
        }
    });
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { first_name, email, password } = req.body;
    registerUser(first_name, email, password, (success) => {
        if (success) {
            res.redirect('/login');
        } else {
            res.send('Email already exists');
        }
    });
});

app.get('/', checkAuth, (req, res) => {
    const username = req.session.username;
    calculateSummary(username);
    const items = [];
    fs.createReadStream(path.join(__dirname, `data/users/${username}/${username}_items.csv`))
        .pipe(csvParser())
        .on('data', (row) => {
            items.push(row);
        })
        .on('end', () => {
            const userDataPath = path.join(__dirname, `data/users/${username}/${username}_userdata.csv`);
            let userData = {};
            if (fs.existsSync(userDataPath)) {
                const data = fs.readFileSync(userDataPath, 'utf8');
                const [username, email, phone] = data.split(',');
                userData = { username, email, phone };
            }
            res.render('dashboard', { items, username, userData });
        });
});

app.post('/submit', checkAuth, (req, res) => {
    const username = req.session.username;
    const { items, price, paymentMode, gpayName, gpayPhone } = req.body;
    const orderId = generateOrderId();
    let transactionItems = items.join(' - ');
    let transaction = `${orderId},${transactionItems},${price},${paymentMode},${gpayName || 'N/A'},${gpayPhone || 'N/A'}`;

    fs.access(path.join(__dirname, `data/users/${username}/${username}_export.csv`), fs.constants.F_OK, (err) => {
        if (err) {
            fs.writeFile(path.join(__dirname, `data/users/${username}/${username}_export.csv`), transaction + '\n', (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    res.send(`${gpayName} have ordered an item`);
                    calculateSummary(username);
                }
            });
        } else {
            fs.appendFile(path.join(__dirname, `data/users/${username}/${username}_export.csv`), '\n' + transaction, (err) => {
                if (err) {
                    console.error('Error writing to export.csv:', err);
                    res.status(500).send('Error submitting items');
                } else {
                    res.send(`${gpayName} have ordered an item`);
                    calculateSummary(username);
                }
            });
        }
    });

    let orderData = `${orderId},${transactionItems},${gpayName || 'N/A'},Not Completed`;
    fs.appendFile(path.join(__dirname, `data/users/${username}/${username}_orders.csv`), '\n' + orderData, (err) => {
        if (err) {
            console.error('Error writing to orders.csv:', err);
        }
    });
});

app.get('/orders', checkAuth, (req, res) => {
    const username = req.session.username;
    const orders = [];
    fs.createReadStream(path.join(__dirname, `data/users/${username}/${username}_orders.csv`))
        .pipe(csvParser())
        .on('data', (row) => {
            orders.push(row);
        })
        .on('end', () => {
            const filteredOrders = orders.filter(order => order['Status'] !== 'Completed');
            res.render('orders', { orders, username });
        });
});

app.post('/add-item', checkAuth, upload.single('itemImage'), (req, res) => {
    const username = req.session.username;
    const { itemName, itemPrice, itemType } = req.body;
    const itemImage = `/images/${req.file.filename}`;
    const itemData = `${itemName},${itemPrice},${itemType},${itemImage}`;

    fs.appendFile(path.join(__dirname, `data/users/${username}/${username}_items.csv`), '\n' + itemData, (err) => {
        if (err) {
            console.error('Error writing to items.csv:', err);
            res.status(500).send('Error adding item');
        } else {
            res.redirect('/');
        }
    });
});

app.post('/update-account', checkAuth, (req, res) => {
    const username = req.session.username;
    const { email, phone } = req.body;
    const userData = `${username},${email},${phone}`;

    fs.writeFile(path.join(__dirname, `data/users/${username}/${username}_userdata.csv`), userData, (err) => {
        if (err) {
            console.error('Error writing to userdata.csv:', err);
            res.status(500).send('Error updating account');
        } else {
            res.redirect('/');
        }
    });
});

app.get('/summary', checkAuth, (req, res) => {
    const username = req.session.username;
    const summaryData = JSON.parse(fs.readFileSync(path.join(__dirname, `data/users/${username}/${username}_summary.json`), 'utf-8'));
    res.json(summaryData);
});

app.get('/recent-transactions', checkAuth, (req, res) => {
    const username = req.session.username;
    const transactions = [];
    fs.createReadStream(path.join(__dirname, `data/users/${username}/${username}_export.csv`))
        .pipe(csvParser())
        .on('data', (row) => {
            transactions.push(row);
        })
        .on('end', () => {
            const lastTenTransactions = transactions.slice(-10);
            res.json(lastTenTransactions);
        });
});

app.post('/complete-order', checkAuth, (req, res) => {
    const username = req.session.username;
    const orderId = req.body.orderId;
    const orders = [];

    fs.createReadStream(path.join(__dirname, `data/users/${username}/${username}_orders.csv`))
        .pipe(csvParser())
        .on('data', (row) => {
            if (row['Order ID'] === orderId) {
                row['Status'] = 'Completed';
            }
            orders.push(row);
        })
        .on('end', () => {
            const writer = fs.createWriteStream(path.join(__dirname, `data/users/${username}/${username}_orders.csv`));
            writer.write('Order ID,Items,GPAY Name,Status\n');
            orders.forEach((order) => {
                writer.write(`${order['Order ID']},${order['Items']},${order['GPAY Name']},${order['Status']}\n`);
            });
            writer.end();
            res.json({ success: true });
        });
});

app.post('/delete-latest-transaction', checkAuth, (req, res) => {
    const username = req.session.username;
    const lines = fs.readFileSync(path.join(__dirname, `data/users/${username}/${username}_export.csv`), 'utf-8').trim().split('\n');
    lines.pop();
    fs.writeFileSync(path.join(__dirname, `data/users/${username}/${username}_export.csv`), lines.join('\n'));
    res.send('Latest transaction deleted successfully');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Check if items.csv exists and add header if not
fs.access('data/items.csv', fs.constants.F_OK, (err) => {
    if (err) {
        fs.writeFile('data/items.csv', 'Item Name,Item Price,Item Type,Item Image\n', (err) => {
            if (err) {
                console.error('Error writing header to items.csv:', err);
            }
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
