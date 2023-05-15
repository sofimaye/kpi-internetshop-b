const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const session = require('express-session');

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
const redisClient = redis.createClient();

const {MongoClient} = require("mongodb");
const client = new MongoClient('mongodb://localhost:27017');
const db = client.db("internetshop-database");
//collections from the database:
const productsCollection = db.collection('products');
const ordersCollection = db.collection('orders');
const usersCollection = db.collection('users');
const reviewsCollection = db.collection('reviews');

// when first time pull the project invoke this function to add entities to the database
//----------------------------------------------------------------
app.get('/users/new', (req, res) => {
    res.render('add-user');
});
// Create a new user
app.post('/users', async (req, res) => {
    const {name, email, password} = req.body;
    // Check if user with the same email already exists
    const existingUser = await usersCollection.findOne({email});
    if (existingUser) {
        console.log(existingUser)
        return res.render('add-user-fail', {email});
    }
    // Create a new user
    try {
        await usersCollection.insertOne({
            id: await usersCollection.countDocuments() + 1,
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
    const users = await usersCollection.find().toArray();
    res.render('users', {users});
});

// Only authorized user can post, put and delete
// ______________________________________________________________________________________________
// Login route
app.post('/', async (req, res) => {
    const {name, password} = req.body;
    const user = await usersCollection.findOne({name: name, password: password});
    if (user) {
        req.session.user = user;
        res.redirect('/user');
    } else {
        res.render('login-fail');
    }
});
app.get('/user', authenticateSession, async (req, res) => {
    const user = await usersCollection.findOne({id: req.session.user.id});
    const ordersByCustomer = await ordersCollection.find({customerId: req.session.user.id}).toArray();
    const reviewsByCustomer = await reviewsCollection.find({userId: req.session.user.id}).toArray();
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
        let productCount = Number(await redisClient.get(cacheKey));
        if (!productCount) {
            // If it doesn't exist in cache, get it from the database
            productCount = await productsCollection.countDocuments();
            // Store the product count in cache indefinitely
            await redisClient.set(cacheKey, productCount);
        }
        const productExist = await productsCollection.countDocuments({name, price});
        if (productExist > 0) {
            return res.status(408).send({message: 'This product already exists'});
        } else {
            const newProduct = {id: productCount + 1, name, price};
            await productsCollection.insertOne(newProduct);
            // Increment the product count in cache
            await redisClient.set(cacheKey, productCount + 1);
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
    const result = await productsCollection.findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Product deletion route
app.delete('/products/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await productsCollection.deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});
// ______________________________________________________________________________________________
// Products endpoints
app.get('/products', async (req, res) => {
    const products = await productsCollection.find().toArray();
    res.send(products);
});

app.get('/products/:id', async (req, res) => {
    const id = Number(req.params.id);
    const product = await productsCollection.findOne({id});
    if (product) {
        res.send(product);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Orders endpoints
// get and post orders can only authorized user
app.get('/orders', authenticateSession, async (req, res) => {
    const ordersByAuthUser = await ordersCollection.find({customerId: req.session.user.id}).toArray();
    res.send(ordersByAuthUser);
});


//The user can only find an order by its ID among their own orders
app.get('/orders/:id', async (req, res) => {
    const id = Number(req.params.id);
    const order = await ordersCollection.findOne({id});
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
        order.id = await ordersCollection.countDocuments() + 1;
        // Додаємо id юзера до order
        order.customerId = userId;
        // Вставляємо order в колекцію
        await ordersCollection.insertOne(order);
        // Повертаємо успішну відповідь з order
        res.status(201).send(order);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


app.patch('/orders/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await ordersCollection.findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Order not found'});
    }
});

app.delete('/orders/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await ordersCollection.deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});


app.get('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    const user = await usersCollection.findOne({id});
    if (user) {
        res.send(user);
    } else {
        res.status(404).send({message: 'User not found'});
    }
});


app.patch('/users/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await usersCollection.findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});


app.delete('/users/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await usersCollection.deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

// Reviews endpoints
app.get('/reviews', async (req, res) => {
    const reviews = await reviewsCollection.find().toArray();
    res.send(reviews);
});


app.get('/reviews/:id', async (req, res) => {
    const id = Number(req.params.id);
    const review = await reviewsCollection.findOne({id});
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
        review.id = await reviewsCollection.countDocuments() + 1;
        // Додаємо id юзера до order
        review.userId = userId;
        // Вставляємо order в колекцію
        await reviewsCollection.insertOne(review);
        // Повертаємо успішну відповідь з order
        res.status(201).send(review);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.patch('/reviews/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await reviewsCollection.findOneAndUpdate({id}, {$set: req.body}, {returnDocument: "after"});
    if (result.value) {
        res.send(result.value);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

app.delete('/reviews/:id', authenticateSession, async (req, res) => {
    const id = Number(req.params.id);
    const result = await reviewsCollection.deleteOne({id});
    if (result.deletedCount > 0) {
        res.sendStatus(204);
    } else {
        res.status(404).send({message: 'Product not found'});
    }
});

function authenticateSession(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.status(401).send({message: 'Unauthorized'});
    }
}

client.connect().then(() => {
    console.log('Connected successfully to mongo');
    redisClient.connect().then(() => {
        console.log('Connected successfully to redis');
        app.listen(port, () => {
            console.log(`App listening at http://localhost:${port}`);
        });
    });
});



