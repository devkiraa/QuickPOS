# QuickPOS

QuickPOS is a simple and efficient Point of Sale (POS) system built using Node.js and Express. It provides functionalities to manage items, orders, user accounts, and transactions, making it suitable for small businesses and retail stores.

## Features

- User authentication and registration
- Item management (add, update, delete items)
- Order management and processing
- Transaction history and summary
- QR code generation for UPI payments

## Technologies Used

- Node.js
- Express
- EJS (for templating)
- Multer (for file uploads)
- CSV Parser
- XML2JS (for XML parsing)
- QRCode (for QR code generation)
- Session management with express-session

## Installation

1. Clone the repository:

```bash
git clone https://github.com/devkiraa/QuickPOS.git
```

2. Navigate to the project directory:

```bash
cd QuickPOS
```

3. Install the dependencies:

```bash
npm install
```

4. Create the necessary directories and files for user data storage. You can create a script or manually ensure the following structure:

```
data/
  └── users/
      └── images/
      └── <username>/
          └── images/
          └── <username>_items.csv
          └── <username>_orders.csv
          └── <username>_export.csv
          └── <username>_summary.json
          └── <username>_userdata.csv
users.xml
```

5. Start the server:

```bash
npm start
```

6. Open your web browser and navigate to:

```
http://localhost:3000
```

## Usage

### User Registration and Login

- Visit `/register` to create a new account.
- Visit `/login` to sign in with your existing account.

### Dashboard

- After logging in, you'll be redirected to the dashboard where you can manage items and orders.

### Item Management

- **Add Item:** Use the "Add Item" form to add new items to your inventory.
- **Update Item:** Modify existing item details.
- **Delete Item:** Remove items from your inventory.

### Order Management

- **Process Orders:** Submit orders with items, prices, and payment modes.
- **Complete Orders:** Mark orders as completed once processed.

### Transaction History

- View recent transactions and summaries.
- Generate QR codes for UPI payments.

## File Structure

- `app.js`: Main server file.
- `views/`: Directory containing EJS templates.
- `data/`: Directory for storing user data, images, and transaction records.
- `public/`: Static files like stylesheets and client-side scripts.

## API Endpoints

- `GET /login`: Render the login page.
- `POST /login`: Authenticate and log in the user.
- `GET /register`: Render the registration page.
- `POST /register`: Register a new user.
- `GET /`: Render the dashboard for logged-in users.
- `POST /submit`: Submit an order.
- `POST /add-item`: Add a new item.
- `POST /update-item`: Update an existing item.
- `POST /delete-item`: Delete an item.
- `POST /update-account`: Update user account details.
- `GET /summary`: Get the summary of transactions.
- `GET /recent-transactions`: Get the recent transactions.
- `POST /complete-order`: Mark an order as completed.
- `POST /delete-latest-transaction`: Delete the latest transaction.
- `POST /process-payment`: Process a payment and generate QR code for UPI.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss your changes.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

```

### Notes
- Make sure to create the initial `users.xml` file and required directory structure as outlined in the installation steps.
- The server listens on port 3000 by default; you can change this in the `app.js` file if needed.
