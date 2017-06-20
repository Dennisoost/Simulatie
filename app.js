const coordinates = require('./coords.json');
const _ = require('lodash');
const request = require('request');
const amqp = require('amqplib/callback_api');
const WebSocket = require('ws');
const polyline = require('polyline');
const googleMaps = require('@google/maps').createClient({
    key: 'AIzaSyDOWslX02PPEzo7772zCq-gZJboUvxT0fM'
});

const minutes = 0.20;
const interval = minutes * 60 * 1000;

let amountOfRoutes = 2;
let operations = [];
let routeObjectArray = [];

let missedWaypoints = [];
let useOSRM = true;

const wss = new WebSocket.Server({ port: 8081 });
let conn;

wss.on('connection', function connection(ws) {
    conn = ws;
    ws.send('connected');

    ws.on('message', function incoming(data) {
        console.log(data);
        routeObjectArray = [];
        generateRoutes(data);

        Promise.all(operations).then(() => {
            sendWaypoints();
        });
    });
});


console.log(process.env.MQ_HOST);
generateRoutes(amountOfRoutes);

Promise.all(operations).then(() => {
    sendWaypoints();
});

function sendWaypoints () {
    setInterval(() => {
        let removeFromRoutes = [];
        _.forEach(routeObjectArray, (routeObject, index) => {
            var date = new Date();
            let waypoint = {};
            waypoint.cartracker = routeObject.cartrackerId;
            console.log(routeObject.route[0]);
            waypoint.lat = routeObject.route[0].lat;
            waypoint.lon = routeObject.route[0].lng;
            waypoint.date = date;
            waypoint.index = routeObject.itemLength - routeObject.route.length;

            sendToMQ(waypoint);
            if (conn !== undefined) {
                conn.send(JSON.stringify(waypoint));
            }
            if (missedWaypoints.length > 0) {
                console.log(missedWaypoints);
                sendMissedToMQ();
            }

            // Check if route has atleast 2 waypoints
            // Else remove the route from the routes array
            if (routeObject.route.length >= 2) {
                routeObject.route.splice(0, 1)
            } else {
                removeFromRoutes.push(index);
            }
        });
        _.forEach(removeFromRoutes, (routeIndex) => {
            routeObjectArray.splice(routeIndex, 1);
            generateRoutes(1);
        });
        console.log(routeObjectArray.length)
    }, interval);
}

function sendMissedToMQ() {
    amqp.connect('amqp://localhost', function(err, conn) {
        conn.createChannel(function(err, ch) {
            let q = 'hello';

            ch.assertQueue(q, { durable: false });
            // Note: on Node 6 Buffer.from(msg) should be used
            ch.sendToQueue(q, new Buffer.from(JSON.stringify(missedWaypoints)));
            //console.log(missedWaypoints);
            ch.close();
            missedWaypoints = [];
        });
    });
}

function sendToMQ(mqMessage) {
    amqp.connect('amqp://localhost', function(err, conn) {
        if (err) {
            console.log(err);
            addMessageToMissed(mqMessage)
        } else {
            conn.createChannel(function(err, ch) {
                if (err) {
                    addMessageToMissed(mqMessage)
                } else {
                    let q = 'hello';

                    ch.assertQueue(q, { durable: false });
                    // Note: on Node 6 Buffer.from(msg) should be used
                    ch.sendToQueue(q, new Buffer.from(JSON.stringify(mqMessage)));
                    ch.close();
                    console.log('message is send')
                }
            });
        }
    });
}

function addMessageToMissed(mqMessage) {
    if (missedWaypoints[mqMessage.cartrackerId] == null) {
        missedWaypoints[mqMessage.cartrackerId] = [mqMessage];
    } else {
        let previousMissedWaypoints = missedWaypoints[mqMessage.cartrackerId];
        previousMissedWaypoints.push(mqMessage);
        missedWaypoints[mqMessage.cartrackerId] = previousMissedWaypoints;
    }
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
        route.beginpoint = coordinates[keys[keys.length * Math.random() << 0]];

        // Pick random endpoint that's different from the beginpoint
        while (route.beginpoint === route.endpoint || route.endpoint === "") {
            route.endpoint = coordinates[keys[keys.length * Math.random() << 0]];
        }
	
	if(useOSRM) {
           route.beginpoint = route.beginpoint.split(',').reverse().join(',');
           route.endpoint = route.endpoint.split(',').reverse().join(',');
	}
        return route;
    });
	if(useOSRM) { getRoutesFromOSRM(coordList); }
	else { getRoutesFromGooglemaps(coordList); }
    }

// function getRoutesFromOSRM(coords) {
//     coords.forEach((route) => {
//         operations.push(new Promise((resolve, reject) => {
//             request.get('http://router.project-osrm.org/route/v1/driving/' +
//                 route.beginpoint +
//                 ';' + route.endpoint +
//                 '?overview=false&steps=true&overview=full', (error, response, body) => {
//                     if (error) {
//                         reject(error);
//                     } else {
//                         let value = JSON.parse(body);
//
//                         let steps = polyline.decode(value['routes'][0]['geometry']);
//                         steps = _.map(steps, function(step) {
//                             return { lat: step[0], lng: step[1] };
//                         });
//
//                         let routeObject = {};
//                         routeObject.cartrackerId = randomIntFromInterval(1, 50);
//                         routeObject.route = steps;
//                         routeObject.itemLength = steps.length; // TODO
//                         routeObjectArray.push(routeObject);
//                         resolve();
//                     }
//                 });
//         }));
//     });
// }

function getRoutesFromOSRM(coords) {
    coords.forEach((route) => {
        operations.push(new Promise((resolve, reject) => {
            request.get('http://192.168.25.216:5000/route/v1/driving/' +
                route.beginpoint +
                ';' + route.endpoint +
                '?overview=full', (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    let value = JSON.parse(body);
                    let steps = polyline.decode(value['routes'][0]['geometry']);
                    steps = _.map(steps, function(step) {
                        return { lat: step[0], lng: step[1] };
                    });

                    let routeObject = {};
                    routeObject.cartrackerId = randomIntFromInterval(1, 50);
                    routeObject.route = steps;
                    routeObject.itemLength = steps.length; // TODO
                    routeObjectArray.push(routeObject);
                    resolve();
                }
            });
        }));
    });
}


function getRoutesFromGooglemaps(coords) {
    coords.forEach((route) => {
        googleMaps.directions({
            origin: route.beginpoint,
            destination: route.endpoint,
            language: 'en',
            units: 'metric',
            mode: 'driving'
        }, function(err, response) {
            console.log(err)
            if (!err) {
                let steps = [];
                steps = polyline.decode(response.json.routes[0].overview_polyline.points);
                steps = _.map(steps, function(step) {
                    return { lat: step[0], lng: step[1] };
                })

                let routeObject = {};
                routeObject.cartrackerId = randomIntFromInterval(1, 50);
                routeObject.route = steps;
                routeObject.itemLength = steps.length;
                routeObjectArray.push(routeObject);
                resolve();
            }
        })
    });
}


function randomIntFromInterval(min, max) {
    let randomCartrackerId = Math.floor(Math.random() * (max - min + 1) + min);
    while (checkIfCartrackerIdExists(randomCartrackerId)) {
        randomCartrackerId = Math.floor(Math.random() * (max - min + 1) + min);
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
