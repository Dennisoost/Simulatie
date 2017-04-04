const coordinates = require('./coords.json');
const _ = require('lodash');
const request = require('request');

const minutes = 0.5;
const interval = minutes * 60 * 1000;

setInterval(() => {

}, interval);

let coords = generateRoutes(10);

_.forEach(coords, (route) => {
    request.get('http://router.project-osrm.org/route/v1/driving/'
        + route.beginpoint
        +';' + route.endpoint
        + '?overview=false&steps=true', (error, response, body) => {
            var value = JSON.parse(body);

            let steps = _.map(value['routes'][0]['legs'][0]['steps'], (step) => {
               return step.maneuver.location;
            });
            console.log(steps)
    });
});

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
    return coordList;
}