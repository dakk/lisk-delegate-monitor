var controllers = require ('./controllers');
var config      = require ('./config.json');

var morgan      = require ('morgan');
var express     = require ('express');


process.on('uncaughtException', function (err) {
	log.critical ('Except', err.stack);
});


/* Start the update loop */
controllers.update ();
setInterval (controllers.update, 10000);


/* Server */
var app = express ();
app.use (morgan ('route', { skip: function (req, res) { return (req.method == 'OPTIONS'); } }));

app.set ('views', __dirname + '/views');
app.set ('view engine', 'jade');
app.use ('/', controllers);
var server = app.listen (config.port);
