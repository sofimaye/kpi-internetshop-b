const chai = require('chai');
const chaiHttp = require('chai-http');
const { MongoClient } = require('mongodb');
const redis = require('redis');
const app = require('./server');

chai.use(chaiHttp);
const { expect } = chai;

describe('App', () => {
    let server;
    const dbClient = new MongoClient('mongodb://localhost:27017');
    let redisClient;

    before(function(done) {
        this.timeout(5000);
        console.log("Starting up")
        app.use((req, res, next) => {
            // Simulate the session behavior
            req.session = { user: { id: 1 } };
            console.log("Simulating session", req.session)
            next();
        });

        // Set up database connection and server before running tests
        dbClient.connect().then(client => {
            console.log("Successfully connected to mongo in tests")
            app.locals.db = dbClient.db('internetshop-database');
            redisClient = redis.createClient();
            redisClient.connect().then(() => {
                console.log("Successfully connected to redis in tests")
                app.locals.redisClient = redisClient;
                server = app.listen(3000, () => {
                    console.log('Test server is running');
                    done();
                });
            })
        });
    });

    beforeEach((done) => {
        // Truncate all collections before each test
        Promise.all([
            app.locals.db.collection('products').deleteMany({}),
            app.locals.db.collection('orders').deleteMany({}),
            app.locals.db.collection('users').deleteMany({}),
            app.locals.db.collection('reviews').deleteMany({})
        ]).then(() => done());
    });


    after((done) => {
        // Close database connection and server after running tests
        dbClient.close();
        redisClient.quit();
        server.close(() => {
            console.log('Test server closed');
            done();
        });
    });

    describe('GET /users/new', () => {
        it('should render the add-user page', (done) => {
            chai
                .request(app)
                .get('/users/new')
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.text).to.include('Add User');
                    done();
                });
        });
    });

    describe('POST /users', () => {
        it('should create a new user and redirect to /users', (done) => {
            chai
                .request(app)
                .post('/users')
                .send({ name: 'John', email: 'john@example.com', password: 'password' })
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res).to.have.header('content-type', 'text/html; charset=utf-8');
                    expect(res.text).to.not.be.empty;
                    done();
                });
        });
    });

    describe('GET /users', () => {
        it('should render the users page', (done) => {
            chai
                .request(app)
                .get('/users')
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.text).to.include('Users');
                    done();
                });
        });
    });

    describe('POST /', () => {
        it('should log in the user and redirect to /user', (done) => {
            chai
                .request(app)
                .post('/')
                .send({ name: 'John', password: 'password' })
                .end((err, res) => {
                    expect(res).to.have.status(302);
                    expect(res).to.redirectTo('/user');
                    done();
                });
        });
    });

    describe('GET /user', () => {
        it('should render the login-success page', (done) => {
            chai
                .request(app)
                .get('/user')
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.text).to.include('Login Success');
                    done();
                });
        });
    });
    describe('GET /', () => {
        it('should render the login page', (done) => {
            chai
                .request(app)
                .get('/')
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.text).to.include('Login');
                    done();
                });
        });
    });

    describe('POST /products', () => {
        it('should create a new product and return a success status', (done) => {
            chai
                .request(app)
                .post('/products')
                .send({ name: 'Product 1', price: 10 })
                .end((err, res) => {
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('id');
                    expect(res.body).to.have.property('name', 'Product 1');
                    expect(res.body).to.have.property('price', 10);
                    done();
                });
        });
    });

    describe('PATCH /products/:id', () => {
        it('should update the product with the given id', (done) => {
            // First, create a new product to update
            app.locals.db.collection('products').insertOne({ id: 1, name: 'Product', price: 20 })
                .then(() => {
                    chai
                        .request(app)
                        .patch('/products/1')
                        .send({ price: 30 })
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('price', 30);
                            done();
                        });
                });
        });
    });

    describe('DELETE /products/:id', () => {
        it('should delete the product with the given id', (done) => {
            // First, create a new product to delete
            app.locals.db.collection('products').insertOne({ id: 1, name: 'Product', price: 20 })
                .then(() => {
                    chai
                        .request(app)
                        .delete('/products/1')
                        .end((err, res) => {
                            expect(res).to.have.status(204);
                            done();
                        });
                });
        });
    });

    describe('GET /users/:id', () => {
        it('should return the user with the given id', (done) => {
            app.locals.db.collection('users').insertOne({ id: 1, name: 'John', email: 'john@example.com', password: 'password' })
                .then(() => {
                    chai
                        .request(app)
                        .get('/users/1')
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('id', 1);
                            expect(res.body).to.have.property('name', 'John');
                            expect(res.body).to.have.property('email', 'john@example.com');
                            done();
                        });
                });
        });
    });

    describe('PATCH /users/:id', () => {
        it('should update the user with the given id', (done) => {
            app.locals.db.collection('users').insertOne({ id: 1, name: 'John', email: 'john@example.com', password: 'password' })
                .then(() => {
                    chai
                        .request(app)
                        .patch('/users/1')
                        .send({ name: 'John Doe' })
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('name', 'John Doe');
                            done();
                        });
                });
        });
    });

    describe('DELETE /users/:id', () => {
        it('should delete the user with the given id', (done) => {
            app.locals.db.collection('users').insertOne({ id: 1, name: 'John', email: 'john@example.com', password: 'password' })
                .then(() => {
                    chai
                        .request(app)
                        .delete('/users/1')
                        .end((err, res) => {
                            expect(res).to.have.status(204);
                            done();
                        });
                });
        });
    });

    describe('GET /reviews', () => {
        it('should return a list of reviews', (done) => {
            app.locals.collection('reviews').insertMany([
                { id: 1, userId: 1, review: 'Great product' },
                { id: 2, userId: 1, review: 'Excellent service' },
                { id: 3, userId: 2, review: 'Good quality' }
            ]).then(() => {
                chai
                    .request(app)
                    .get('/reviews')
                    .end((err, res) => {
                        expect(res).to.have.status(200);
                        expect(res.body).to.be.an('array');
                        expect(res.body).to.have.lengthOf(3);
                        expect(res.body[0]).to.have.property('id', 1);
                        expect(res.body[0]).to.have.property('userId', 1);
                        expect(res.body[0]).to.have.property('review', 'Great product');
                        done();
                    });
            });
        });
    });

    describe('GET /reviews/:id', () => {
        it('should return the review with the given id', (done) => {
            app.locals.collection('reviews').insertOne({ id: 1, userId: 1, review: 'Great product' })
                .then(() => {
                    chai
                        .request(app)
                        .get('/reviews/1')
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('id', 1);
                            expect(res.body).to.have.property('userId', 1);
                            expect(res.body).to.have.property('review', 'Great product');
                            done();
                        });
                });
        });
    });

    describe('POST /reviews', () => {
        it('should create a new review and return a success status', (done) => {
            chai
                .request(app)
                .post('/reviews')
                .send({ userId: 1, review: 'Great product' })
                .end((err, res) => {
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('id');
                    expect(res.body).to.have.property('userId', 1);
                    expect(res.body).to.have.property('review', 'Great product');
                    done();
                });
        });
    });

    describe('PATCH /reviews/:id', () => {
        it('should update the review with the given id', (done) => {
            app.locals.collection('reviews').insertOne({ id: 1, userId: 1, review: 'Great product' })
                .then(() => {
                    chai
                        .request(app)
                        .patch('/reviews/1')
                        .send({ review: 'Excellent product' })
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('review', 'Excellent product');
                            done();
                        });
                });
        });
    });

    describe('DELETE /reviews/:id', () => {
        it('should delete the review with the given id', (done) => {
            app.locals.collection('reviews').insertOne({ id: 1, userId: 1, review: 'Great product' })
                .then(() => {
                    chai
                        .request(app)
                        .delete('/reviews/1')
                        .end((err, res) => {
                            expect(res).to.have.status(204);
                            done();
                        });
                });
        });
    });

    describe('GET /orders', () => {
        it('should return a list of orders by the authenticated user', (done) => {
            // First, insert some sample orders into the app.locals.db.collection('orders')
            app.locals.db.collection('orders').insertMany([
                { id: 1, customerId: 1, product: 'Product 1' },
                { id: 2, customerId: 1, product: 'Product 2' },
                { id: 3, customerId: 2, product: 'Product 3' }
            ]).then(() => {

                chai
                    .request(app)
                    .get('/orders')
                    .end((err, res) => {
                        expect(res).to.have.status(200);
                        expect(res.body).to.be.an('array');
                        expect(res.body).to.have.lengthOf(2);
                        expect(res.body[0]).to.have.property('id', 1);
                        expect(res.body[0]).to.have.property('customerId', 1);
                        expect(res.body[0]).to.have.property('product', 'Product 1');
                        done();
                    });
            });
        });
    });
    describe('GET /orders/:id', () => {
        it('should return the order with the given id', (done) => {
            app.locals.db.collection('orders').insertOne({ id: 1, customerId: 1, product: 'Product 1' })
                .then(() => {
                    chai
                        .request(app)
                        .get('/orders/1')
                        .set('Cookie', 'session=user_session')
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('id', 1);
                            expect(res.body).to.have.property('customerId', 1);
                            expect(res.body).to.have.property('product', 'Product 1');
                            done();
                        });
                });
        });
    });

    describe('POST /orders', () => {
        it('should create a new order and return a success status', (done) => {
            chai
                .request(app)
                .post('/orders')
                .set('Cookie', 'session=user_session')
                .send({ customerId: 1, product: 'Product 1' })
                .end((err, res) => {
                    expect(res).to.have.status(201);
                    expect(res.body).to.have.property('id');
                    expect(res.body).to.have.property('customerId', 1);
                    expect(res.body).to.have.property('product', 'Product 1');
                    done();
                });
        });
    });

    describe('PATCH /orders/:id', () => {
        it('should update the order with the given id', (done) => {
            app.locals.db.collection('orders').insertOne({ id: 1, customerId: 1, product: 'Product 1' })
                .then(() => {
                    chai
                        .request(app)
                        .patch('/orders/1')
                        .set('Cookie', 'session=user_session')
                        .send({ product: 'Updated Product 1' })
                        .end((err, res) => {
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.property('product', 'Updated Product 1');
                            done();
                        });
                });
        });
    });

    describe('DELETE /orders/:id', () => {
        it('should delete the order with the given id', (done) => {
            app.locals.db.collection('orders').insertOne({ id: 1, customerId: 1, product: 'Product 1' })
                .then(() => {
                    chai
                        .request(app)
                        .delete('/orders/1')
                        .set('Cookie', 'session=user_session')
                        .end((err, res) => {
                            expect(res).to.have.status(204);
                            done();
                        });
                });
        });
    });

});