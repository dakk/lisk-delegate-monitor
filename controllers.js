var express		= require ('express');
var request     = require ('request');
var config      = require ('./config.json');

var delegateList = [];

exports.update = function () {
	request('http://' + config.node + '/api/delegates/?limit=200&offset=0&orderBy=rate:asc', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var data = JSON.parse(body);

			delegateList = [];
		}
	});
};


/** Routes */
var router 		= express.Router();

var checkLogin = function (req, res, next) {
	next ();
};

router.get('/', checkLogin, function (req, res) {
	res.render ('users', { users: data, title: 'Pending '+provider+' verify' });
});



exports.router = router;