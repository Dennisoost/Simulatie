const coordinates = require('./coords.json');
const _ = require('lodash');
const request = require('request');
const amqp = require('amqplib/callback_api');

const minutes = 0.1;
const interval = minutes * 60 * 1000;

let amountOfRoutes = 50;
let operations = [];
let myRoutes = [];
let routeObjectArray = [];

generateRoutes(amountOfRoutes);

Promise.all(operations).then(() => {
    setInterval(() => {
        let removeFromRoutes = [];

        _.forEach(routeObjectArray, (routeObject, index) => {
            var date = new Date();
            let waypoint = {};
            waypoint.cartracker = routeObject.cartrackerId;
            waypoint.lat = routeObject.route[0][0];
            waypoint.lon = routeObject.route[0][1];
            waypoint.date = date;
            console.log(waypoint);
            // send message, wait for message to be sent
            sendToMQ(waypoint);
            // Check if route has atleast 2 waypoints
            // Else remove the route from the routes array
            if(routeObject.route.length >= 2) {
                routeObject.route.pop();
            } else {
                removeFromRoutes.push(index);
            }
        });
        _.forEach(removeFromRoutes, (routeIndex) =>
        {
            routeObjectArray.splice(routeIndex, 1);
            generateRoutes(1);
        });
        console.log(routeObjectArray.length)
    }, interval);
});

function sendToMQ(mqMessage) {
    amqp.connect('amqp://localhost', function(err, conn) {
        conn.createChannel(function(err, ch) {
            let q = 'hello';

            ch.assertQueue(q, {durable: false});
            // Note: on Node 6 Buffer.from(msg) should be used
            ch.sendToQueue(q, new Buffer.from(JSON.stringify(mqMessage)));
        });
    });
}

function generateRoutes(amount) {

    // Get keys (places)
    let keys = Object.keys(coordinates);

    // Generate a x amount of routes
    let coordList = _.times(amount, (index) => {

        // Create route object
        let route = {
            "beginpoint": "",
            "endpoint": ""
        };

        // Pick random beginpoint
        route.beginpoint = coordinates[keys [keys.length * Math.random() << 0]];

        // Pick random endpoint that's different from the beginpoint
        while (route.beginpoint === route.endpoint || route.endpoint === "") {
            route.endpoint = coordinates[keys [keys.length * Math.random() << 0]];
        }

        return route;
    });
    getRoutesFromOSRM(coordList);
}

function getRoutesFromOSRM(coords){
    coords.forEach((route) => {
        operations.push(new Promise((resolve, reject) => {
            request.get('http://router.project-osrm.org/route/v1/driving/'
                + route.beginpoint
                +';' + route.endpoint
                + '?overview=false&steps=true', (error, response, body) => {
                if(error) {
                    reject(error);
                } else {
                    let value = JSON.parse(body);

                    let steps = _.map(value['routes'][0]['legs'][0]['steps'], (step) => {
                        return step.maneuver.location;
                    });

                    let routeObject = {};
                    routeObject.cartrackerId = randomIntFromInterval(1, 50);
                    routeObject.route = steps;
                    routeObjectArray.push(routeObject);
                    resolve();
                }
            });
        }));
    });
}

function randomIntFromInterval(min,max) {
    let randomCartrackerId = Math.floor(Math.random()*(max-min+1)+min);
    while (checkIfCartrackerIdExists(randomCartrackerId)) {
        randomCartrackerId = Math.floor(Math.random()*(max-min+1)+min);
    }
    return randomCartrackerId;
}

function checkIfCartrackerIdExists(cartrackerId) {
    let idExists = false;
    _.forEach(routeObjectArray, (route) => {
        if (route.cartrackerId === cartrackerId) idExists = true;
    });
    return idExists;
}