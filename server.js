"use strict";

var controllers = require ('./controllers');
var fs			= require ('fs');
var https 		= require ('https');

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
setInterval (controllers.update, 14000);
setTimeout (controllers.updateBalances, 24000);
setInterval (controllers.updateBalances, 60000);

if (!config.all) {
	setTimeout (controllers.updateVotes, 10000);
	setInterval (controllers.updateVotes, 600000);
}

setTimeout (controllers.updateDonations, 10000);
setInterval (controllers.updateDonations, 1200000);

setTimeout (controllers.updatePersonalStats, 10000);
setInterval (controllers.updatePersonalStats, 60000);


/* Server */
var app = express ();

if (config.https) {
	app.use (function (req, res, next) {
		if (req.secure) 
			next();
		else			
			res.redirect('https://' + req.headers.host + req.url);
	});
}

app.use (morgan ('route', { skip: function (req, res) { return (req.method == 'OPTIONS'); } }));

app.set ('views', __dirname + '/views');
app.set ('view engine', 'jade');
app.use ('/', controllers.router);


if (config.https) {	
	var certs = {
		key: fs.readFileSync	(config.https.key, 'utf8'),
		cert: fs.readFileSync	(config.https.cert, 'utf8'),
	};
	var server = https.createServer(certs, app).listen (config.https.port);
	var server2 = app.listen (config.port);
	log.debug ('Server', 'Listening on port: ' + config.https.port);
} else {
	var server = app.listen (config.port);
	log.debug ('Server', 'Listening on port: ' + config.port);
}
