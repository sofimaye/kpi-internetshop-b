const port = process.env.PORT || 3000;
require('dotenv').config({path: '.env.prod'});
const app = require('./server');

app.locals.dbClient.connect().then(() => {
    console.log('Connected successfully to MongoDb Atlas');
    app.locals.redisClient.connect().then(() => {
        console.log('Connected successfully to redis');
        app.listen(port, () => {
            console.log(`App listening at http://localhost:${port}`);
        });
    });
});
