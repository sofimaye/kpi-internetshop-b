const app = require('./server');
const port = process.env.PORT || 3000;

app.locals.dbClient.connect().then(() => {
    console.log('Connected successfully to mongo');
    app.locals.redisClient.connect().then(() => {
        console.log('Connected successfully to redis');
        app.listen(port, () => {
            console.log(`App listening at http://localhost:${port}`);
        });
    });
});
