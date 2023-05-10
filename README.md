# kpi-internetshop-b
REST API for internetshop

For the initial container startup write the command below locally:
docker run -d -p 27017:27017 --name mongo mongo:latest

If the container already exist but it "exited":
docker start mongo
docker start redis

npm start (to run the app)

First to login existing user through Postman you need the next fields(JSON):
POST http://localhost:3000/
{
"name": string,
"password": string
}

To get the list of users:
GET http://localhost:3000/users

To post reviews:
POST http://localhost:3000/reviews
{
"productId": number,
"rating": number,
"comment": string
}

To post, delete, patch you need to be authorized.
