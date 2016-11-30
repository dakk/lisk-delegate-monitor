"use strict";

var controllers = require ('./controllers');

if (process.argv.length >= 3)
	var config      = require ('./' + process.argv[2]);
else
	var config      = require ('./config.json');

var log 		= require ('./log');

var morgan      = require ('morgan');
var express     = require ('express');


process.on('uncaughtException', function (err) {
	console.log ('Except', err.stack);
});


/* Start the update loop */
controllers.update ();
setInterval (controllers.update, 10000);
setTimeout (controllers.updateBalances, 5000);
setInterval (controllers.updateBalances, 60000);
setTimeout (controllers.updateVotes, 10000);
setInterval (controllers.updateVotes, 120000);


/* Server */
var app = express ();
app.use (morgan ('route', { skip: function (req, res) { return (req.method == 'OPTIONS'); } }));

app.set ('views', __dirname + '/views');
app.set ('view engine', 'jade');
app.use ('/', controllers.router);

log.debug ('Server', 'Listening on port: ' + config.port);
var server = app.listen (config.port);
