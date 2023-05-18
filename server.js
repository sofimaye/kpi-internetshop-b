const express = require('express');
const app = express();
require('dotenv').config();
const session = require('express-session');
const {MongoClient} = require("mongodb");

app.use(express.json());
app.use(express.urlencoded());
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
}));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// adding Redis to cache the amount of documents in collection
const redis = require('redis');

const atlasConnectionURL = `mongodb+srv://${process.env.MONGODB_ATLAS_USERNAME}:${process.env.MONGODB_ATLAS_PASSWORD}@${process.env.MONGODB_ATLAS_CLUSTER_URL}/?retryWrites=true&w=majority`;
const atlasConnectionOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
};

const client = new MongoClient(atlasConnectionURL, atlasConnectionOptions);

// const client = new MongoClient('mongodb://localhost:27017');
app.locals.dbClient = client;
// app.locals.db = client.db('internetshop-database');
app.locals.db = client.db('internetshop-b');
app.locals.redisClient = redis.createClient();


//----------------------------------------------------------------
app.get('/users/new', (req, res) => {
    res.render('add-user');
});
// Create a new user
app.post('/users', async (req, res) => {
    const {name, email, password} = req.body;
    // Check if user with the same email already exists
    const existingUser = await req.app.locals.db.collection('users').findOne({email});
    if (existingUser) {
        console.log(existingUser)
        return res.render('add-user-fail', {email});
    }
    // Create a new user
    try {
        await req.app.locals.db.collection('users').insertOne({
            id: await req.app.locals.db.collection('users').countDocuments() + 1,
            name,
            email,
            password
        });
        res.redirect('/users');
    } catch (err) {
        console.log(err)
        res.render('user-not-added')
    }
});

app.get('/users', async (req, res) => {
    const users = await req.app.locals.db.collection('users').find().toArray();
    res.render('users', {users});
});

// Only authorized user can post, put and delete
// ______________________________________________________________________________________________
// Login route
app.post('/', async (req, res) => {
    const {name, password} = req.body;
    const user = await req.app.locals.db.collection('users').findOne({name: name, password: password});
    if (user) {
        req.session.user = user;
        console.log("Successful log in of user with session", req.session);
        res.redirect('/user');
    } else {
        res.render('login-fail');
    }
});
app.get('/user', authenticateSession, async (req, res) => {
    const user = await req.app.locals.db.collection('users').findOne({id: req.session.user.id});
    const ordersByCustomer = await req.app.locals.db.collection('orders').find({customerId: req.session.user.id}).toArray();
    const reviewsByCustomer = await req.app.locals.db.collection('reviews').find({userId: req.session.user.id}).toArray();
    res.render('login-success', {user, ordersByCustomer, reviewsByCustomer});
});


//перевірка якщо юзер залогінений то показувати сторінку юзера
app.get('/', (req, res) => {
    res.render('login');
})

// Product creation route
app.post('/products', authenticateSession, async (req, res) => {
    try {
        const {name, price} = req.body;
        const cacheKey = 'productCount';
        // Check if the product count exists in cache
        let productCount = Number(await req.app.locals.redisClient.get(cacheKey));
        if (!productCount) {
            // If it doesn't exist in cache, get it from the database
            productCount = await req.app.locals.db.collection('products').countDocuments();
            // Store the product count in cache indefinitely
            await req.app.locals.redisClient.set(cacheKey, productCount);
        }
        const productExist = await req.app.locals.db.collection('products').countDocuments({name, price});
        if (productExist > 0) {
            return res.status(408).send({message: 'This product already exists'});
        } else {
            const newProduct = {id: productCount + 1, name, price};
            await req.app.locals.db.collection('products').insertOne(newProduct);
            // Increment the product count in cache
            await req.app.locals.redisClient.set(cacheKey, productCount + 1);
            res.status(201).send(newProduct);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


// Product update route
app.patch('/products/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('products').findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Product deletion route
app.delete('/products/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('products').deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});
// ______________________________________________________________________________________________
// Products endpoints
app.get('/products', async (req, res) => {
    const products = await req.app.locals.db.collection('products').find().toArray();
    res.send(products);
});

app.get('/products/:id', async (req, res) => {
    const id = Number(req.params.id);
    const product = await req.app.locals.db.collection('products').findOne({id});
    if (product) {
        res.send(product);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Orders endpoints
// get and post orders can only authorized user
app.get('/orders', authenticateSession, async (req, res) => {
    const ordersByAuthUser = await req.app.locals.db.collection('orders').find({customerId: req.session.user.id}).toArray();
    res.send(ordersByAuthUser);
});


//The user can only find an order by its ID among their own orders
app.get('/orders/:id', async (req, res) => {
    const id = Number(req.params.id);
    const order = await req.app.locals.db.collection('orders').findOne({id});
    if (order) {
        res.send(order);
    } else {
        res.status(404).send({message: 'Order not found'});
    }
});

app.post('/orders', authenticateSession, async (req, res) => {
    try {
        const order = req.body;
        const userId = req.session.user.id;
        // Отримуємо кількість orders в колекції та додаємо до неї 1
        order.id = await req.app.locals.db.collection('orders').countDocuments() + 1;
        // Додаємо id юзера до order
        order.customerId = userId;
        // Вставляємо order в колекцію
        await req.app.locals.db.collection('orders').insertOne(order);
        // Повертаємо успішну відповідь з order
        res.status(201).send(order);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


app.patch('/orders/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('orders').findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Order not found'});
    }
});

app.delete('/orders/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('orders').deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});


app.get('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    const user = await req.app.locals.db.collection('users').findOne({id});
    if (user) {
        res.send(user);
    } else {
        res.status(404).send({message: 'User not found'});
    }
});


app.patch('/users/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('users').findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});


app.delete('/users/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('users').deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Reviews endpoints
app.get('/reviews', async (req, res) => {
    const reviews = await req.app.locals.db.collection('reviews').find().toArray();
    res.send(reviews);
});


app.get('/reviews/:id', async (req, res) => {
    const id = Number(req.params.id);
    const review = await req.app.locals.db.collection('reviews').findOne({id});
    if (review) {
        res.send(review);
    } else {
        res.status(404).send({message: 'Review not found'});
    }
});


app.post('/reviews', authenticateSession, async (req, res) => {
    try {
        const review = req.body;
        const userId = req.session.user.id;
        // Отримуємо кількість orders в колекції та додаємо до неї 1
        review.id = await req.app.locals.db.collection('reviews').countDocuments() + 1;
        // Додаємо id юзера до order
        review.userId = userId;
        // Вставляємо order в колекцію
        await req.app.locals.db.collection('reviews').insertOne(review);
        // Повертаємо успішну відповідь з order
        res.status(201).send(review);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.patch('/reviews/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('reviews').findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

app.delete('/reviews/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.app.locals.db.collection('reviews').deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

function authenticateSession(req, res, next) {
    console.log("Request session", req.session)
    if (req.session && req.session.user) {
        return next();
    } else {
        res.status(401).send({message: 'Unauthorized'});
    }
}

module.exports = app;

