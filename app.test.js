const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('./server');

chai.use(chaiHttp);
const {expect} = chai;

describe('App', () => {
    let server;
    before(function (done) {
        console.log("Starting up");
        // Set up database connection and server before running tests
        app.locals.dbClient.connect().then(() => {
            console.log("Successfully connected to mongo in tests")
            app.locals.redisClient.connect().then(() => {
                console.log("Successfully connected to redis in tests")
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
        app.locals.dbClient.close();
        app.locals.redisClient.quit();
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
                .send({name: 'John', email: 'john@example.com', password: 'password'})
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
    // Tests
    describe('POST /', () => {
        it('should show fail message when unknown user is trying to login', (done) => {
            chai
                .request(app)
                .post('/')
                .send({name: 'John', password: 'password'})
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res).to.have.header('content-type', 'text/html; charset=utf-8');
                    expect(res.text).to.not.be.empty;
                    done();
                });
        });
        it('should redirect to /user after successful login', (done) => {
            let user = {id: 1, name: 'John', email: 'john@example.com', password: 'password'};
            app.locals.db.collection('users').insertOne(user).then(() => {
                chai
                    .request(app)
                    .post('/')
                    .send({name: user.name, password: user.password})
                    .redirects(0)
                    .end((err, res) => {
                        expect(res).to.have.status(302);
                        expect(res).to.redirectTo('/user');
                        done();
                    });

            })
        });
    });

    // provide authentification check
    describe('GET /user', () => {
        it('should return Unauthorized for an unauthenticated session', (done) => {
            chai
                .request(app)
                .get('/user')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });
    });

    describe('User successfully logged in', () => {
        let cookie;
        const user = {id: 1, name: 'John', email: 'john@example.com', password: 'password'};

        beforeEach((done) => {
            app.locals.db.collection('users').insertOne(user).then(() => {
                chai
                    .request(app)
                    .post('/')
                    .send({name: user.name, password: user.password})
                    .redirects(0)
                    .end((err, res) => {
                        cookie = res.header['set-cookie'];
                        done();
                    });
            });
        });

        describe('POST /products', () => {
            it('should create a new product and return a success status', (done) => {
                chai
                    .request(app)
                    .post('/products')
                    .set('Cookie', cookie) // Set the session ID cookie
                    .send({name: 'Product 1', price: 10})
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
                app.locals.db.collection('products').insertOne({id: 1, name: 'Product', price: 20})
                    .then(() => {
                        chai
                            .request(app)
                            .patch('/products/1')
                            .set('Cookie', cookie)
                            .send({price: 30})
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
                app.locals.db.collection('products').insertOne({id: 1, name: 'Product', price: 20})
                    .then(() => {
                        chai
                            .request(app)
                            .delete('/products/1')
                            .set('Cookie', cookie)
                            .end((err, res) => {
                                expect(res).to.have.status(204);
                                done();
                            });
                    });
            });
        });

        describe('PATCH /users/:id', () => {
            it('should update the user with the given id', (done) => {
                chai
                    .request(app)
                    .patch('/users/1')
                    .set('Cookie', cookie)
                    .send({name: 'Kate'})
                    .end((err, res) => {
                        expect(res).to.have.status(200);
                        expect(res.body).to.have.property('name', 'Kate');
                        done();
                    });
            });
        });

        describe('DELETE /users/:id', () => {
            it('should delete the user with the given id', (done) => {
                chai
                    .request(app)
                    .delete('/users/1')
                    .set('Cookie', cookie)
                    .end((err, res) => {
                        expect(res).to.have.status(204);
                        done();
                    });
            });
        });

        describe('GET /reviews', () => {
            it('should return a list of reviews', (done) => {
                app.locals.db.collection('reviews').insertMany([
                    {id: 1, userId: 1, review: 'Great product'},
                    {id: 2, userId: 1, review: 'Excellent service'},
                    {id: 3, userId: 2, review: 'Good quality'}
                ]).then(() => {
                    chai
                        .request(app)
                        .get('/reviews')
                        .set('Cookie', cookie)
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
                app.locals.db.collection('reviews').insertOne({id: 1, userId: 1, review: 'Great product'})
                    .then(() => {
                        chai
                            .request(app)
                            .get('/reviews/1')
                            .set('Cookie', cookie)
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
                    .set('Cookie', cookie)
                    .send({userId: 1, review: 'Great product'})
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
                app.locals.db.collection('reviews').insertOne({id: 1, userId: 1, review: 'Great product'})
                    .then(() => {
                        chai
                            .request(app)
                            .patch('/reviews/1')
                            .set('Cookie', cookie)
                            .send({review: 'Excellent product'})
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
                app.locals.db.collection('reviews').insertOne({id: 1, userId: 1, review: 'Great product'})
                    .then(() => {
                        chai
                            .request(app)
                            .delete('/reviews/1')
                            .set('Cookie', cookie)
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
                    {id: 1, customerId: 1, product: 'Product 1'},
                    {id: 2, customerId: 1, product: 'Product 2'},
                    {id: 3, customerId: 2, product: 'Product 3'}
                ]).then(() => {
                    chai
                        .request(app)
                        .get('/orders')
                        .set('Cookie', cookie)
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
        describe('POST /orders', () => {
            it('should create a new order and return a success status', (done) => {
                chai
                    .request(app)
                    .post('/orders')
                    .set('Cookie', cookie)
                    .send({customerId: 1, product: 'Product 1'})
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
                app.locals.db.collection('orders').insertOne({id: 1, customerId: 1, product: 'Product 1'})
                    .then(() => {
                        chai
                            .request(app)
                            .patch('/orders/1')
                            .set('Cookie', cookie)
                            .send({product: 'Updated Product 1'})
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
                app.locals.db.collection('orders').insertOne({id: 1, customerId: 1, product: 'Product 1'})
                    .then(() => {
                        chai
                            .request(app)
                            .delete('/orders/1')
                            .set('Cookie', cookie)
                            .end((err, res) => {
                                expect(res).to.have.status(204);
                                done();
                            });
                    });
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


    describe('GET /users/:id', () => {
        it('should return the user with the given id', (done) => {
            app.locals.db.collection('users').insertOne({
                id: 1,
                name: 'John',
                email: 'john@example.com',
                password: 'password'
            })
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


    describe('GET /orders/:id', () => {
        it('should return the order with the given id', (done) => {
            app.locals.db.collection('orders').insertOne({id: 1, customerId: 1, product: 'Product 1'})
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
});