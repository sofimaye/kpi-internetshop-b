const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const session = require('express-session');
const ejs = require('ejs');

app.use(express.json());
app.use(express.urlencoded());
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
// app.set('views', '/views');

// data for products, orders, users, and reviews
const products = [
    { id: 1, name: 'Product 1', price: 10 },
    { id: 2, name: 'Product 2', price: 20 },
    { id: 3, name: 'Product 3', price: 30 },
];

const orders = [
    { id: 1, customerId: 1, productId: 1 },
    { id: 2, customerId: 2, productId: 2 },
    { id: 3, customerId: 3, productId: 3 },
];

const users = [
    { id: 1, name: 'User 1', email: 'user1@example.com' , password: "sm6575895"},
    { id: 2, name: 'User 2', email: 'user2@example.com', password: "rsgsasnsks"},
    { id: 3, name: 'User 3', email: 'user3@example.com', password: "123474848jfjf"},
];


const reviews = [
    { id: 1, productId: 1, userId: 1, rating: 5, comment: 'Great product!' },
    { id: 2, productId: 2, userId: 2, rating: 4, comment: 'Good product.' },
    { id: 3, productId: 3, userId: 3, rating: 3, comment: 'Average product.' },
];

app.get('/users/new', (req, res) => {
    res.render('add-user');
});
// Create a new user
app.post('/users', (req, res) => {
    const { name, email, password } = req.body;
    // Check if user with the same email already exists
    const userExists = users.find((user) => user.email === email);
    if (userExists) {
        return res.status(409).send({ message: 'User with this email already exists' });
    }
    // Create a new user
    const newUser = { id: users.length + 1, name, email, password };
    users.push(newUser);

    res.redirect('/users');
});
app.get('/users', (req, res) => {
    res.render('users', { users });
});

// Only authorized user can post, put and delete
// ______________________________________________________________________________________________
// Login route
app.post('/login', (req, res) => {
    res.render('login');
    const { name, password } = req.body;
    const user = users.find(u => u.name === name && u.password === password);
    if (user) {
        req.session.user = user;
        res.send({ message: 'Logged in successfully' });
    } else {
        res.status(401).send({ message: 'Invalid credentials' });
    }
});
// Product creation route
app.post('/products', authenticateSession, (req, res) => {
    const { name, price } = req.body;
    const productExist = products.find(product => product.name === name && product.price === price);
    if (productExist) {
        return res.status(408).send({ message: 'This product already exists' })
    } else {
        const newProduct = { id: products.length + 1, name, price };
        products.push(newProduct);
        res.status(201).send(newProduct);
    }
});

// Product update route
app.put('/products/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const productIndex = products.findIndex((p) => p.id === id);
    if (productIndex !== -1) {
        const product = req.body;
        products[productIndex] = { ...product, id };
        res.send(products[productIndex]);
    } else {
        res.status(404).send({ message: 'Product not found' });
    }
});

// Product deletion route
app.delete('/products/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const productIndex = products.findIndex((p) => p.id === id);
    if (productIndex !== -1) {
        products.splice(productIndex, 1);
        res.sendStatus(204);
    } else {
        res.status(404).send({ message: 'Product not found' });
    }
});
// ______________________________________________________________________________________________
// Products endpoints
app.get('/products', (req, res) => {
    res.send(products);
});

app.get('/products/:id', (req, res) => {
    const id = Number(req.params.id);
    const product = products.find((p) => p.id === id);
    if (product) {
        res.send(product);
    } else {
        res.status(404).send({ message: 'Product not found' });
    }
});

// Orders endpoints
// get and post orders can only authorized user
app.get('/orders', authenticateSession, (req, res) => {
    const ordersByAuthUser = orders.filter(order => req.session.user.id === order.customerId);
    res.send(ordersByAuthUser);
});


//The user can only find an order by its ID among their own orders
app.get('/orders/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const order = orders.find((o) => o.id === id && o.customerId === req.session.user.id);
    if (order) {
        res.send(order);
    } else {
        res.status(404).send({ message: 'Order not found' });
    }
});

app.post('/orders', authenticateSession, (req, res) => {
    const order = req.body;
    orders.push(order);
    res.status(201).send(order);
});

app.put('/orders/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const orderIndex = orders.findIndex((o) => o.id === id);
    if (orderIndex !== -1) {
        const order = req.body;
        orders[orderIndex] = { ...order, id };
        res.send(orders[orderIndex]);
    } else {
        res.status(404).send({ message: 'Order not found' });
    }
});

app.delete('/orders/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const orderIndex = orders.findIndex((o) => o.id === id);
    if (orderIndex !== -1) {
        orders.splice(orderIndex, 1);
        res.sendStatus(204);
    } else {
        res.status(404).send({ message: 'Order not found' });
    }
});

// Users endpoints
// app.get('/users', (req, res) => {
//     res.send(users);
// });

app.get('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((u) => u.id === id);
    if (user) {
        res.send(user);
    } else {
        res.status(404).send({ message: 'User not found' });
    }
});


app.put('/users/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex !== -1) {
        const user = req.body;
        users[userIndex] = { ...user, id };
        res.send(users[userIndex]);
    } else {
        res.status(404).send({ message: 'User not found' });
    }
});

app.delete('/users/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex !== -1) {
        users.splice(userIndex, 1);
        res.sendStatus(204);
    } else {
        res.status(404).send({ message: 'User not found' });
    }
});

// Reviews endpoints
app.get('/reviews', (req, res) => {
    res.send(reviews);
});

app.get('/reviews/:id', (req, res) => {
    const id = Number(req.params.id);
    const review = reviews.find((r) => r.id === id);
    if (review) {
        res.send(review);
    } else {
        res.status(404).send({ message: 'Review not found' });
    }
});

app.post('/reviews', authenticateSession, (req, res) => {
    const review = req.body;
    reviews.push(review);
    res.status(201).send(review);
});

app.put('/reviews/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const reviewIndex = reviews.findIndex((r) => r.id === id);
    if (reviewIndex !== -1) {
        const review = req.body;
        reviews[reviewIndex] = { ...review, id };
        res.send(reviews[reviewIndex]);
    } else {
        res.status(404).send({ message: 'Review not found' });
    }
});

app.delete('/reviews/:id', authenticateSession, (req, res) => {
    const id = Number(req.params.id);
    const reviewIndex = reviews.findIndex((r) => r.id === id);
    if (reviewIndex !== -1) {
        reviews.splice(reviewIndex, 1);
        res.sendStatus(204);
    } else {
        res.status(404).send({ message: 'Review not found' });
    }
});

function authenticateSession(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.status(401).send({ message: 'Unauthorized' });
    }
}

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});



