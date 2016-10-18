var express		= require ('express');
var request     = require ('request');
var TelegramBot = require('node-telegram-bot-api');

var log			= require ('./log');
var config      = require ('./config.json');


var delegateList = [];
var stats = {
	delegates: 0,
	mined: 0,
	shift: 0
};
var balances = {};
var alive = {};

exports.update = function () {
	log.debug ('Data', 'Updating data...');
	request('http://' + config.node + '/api/delegates/?limit=101&offset=0&orderBy=rate:asc', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var data = JSON.parse(body);

			var delegateList2 = [];
			var stats2 = { delegates: 0, mined: 0, shift: 0 };

	   		for (var i = 0; i < data.delegates.length; i++) {
				if (config.lobby.indexOf (data.delegates[i].username) != -1) {
					stats2.delegates += 1;
					stats2.mined += data.delegates[i].producedblocks;
					data.delegates[i].state = 2;
					delegateList2.push (data.delegates[i]);
				}
			}

			for (var d in balances) {
				stats2.shift += Math.floor (balances[d]);
			}



			request('http://' + config.node + '/api/blocks?limit=100&orderBy=height:desc', function (err, response, body) {
				if (!error && response.statusCode == 200) {
					var data = JSON.parse(body);

					request('http://' + config.node + '/api/blocks?limit=100&offset=100&orderBy=height:desc', function (err, response, body) {
						if (!error && response.statusCode == 200) {
							var data2 = JSON.parse(body);
							data.blocks = data.blocks.concat (data2.blocks);

							alive = {};
							for (var i = 0; i < data.blocks.length; i++) {
								alive [data.blocks[i].generatorId] = true;
							}
							stats2.notalive = 0;
							for (var i = 0; i < delegateList2.length; i++) {
								if (! (delegateList2[i].address in alive)) {
									stats2.notalive += 1;
									alive [delegateList2[i].address] = false;
								}
							}
						}

						delegateList = delegateList2;
						stats = stats2;

						log.debug ('Data', 'Data updated.');
					});
				}
			});
		

			//http://46.16.190.190:9305/api/peers?limit=100&offset=0&state=1

			
		}
	});
};


exports.updateBalances = function () {
	log.debug ('Data', 'Updating balance data...');
	for (var i = 0; i < delegateList.length; i++) {
		request ('http://' + config.node + '/api/accounts?address=' + delegateList[i].address, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var data = JSON.parse(body);
				balances [data.account.address] = data.account.balance / 100000000;
			}
		});
	}
};


/** Routes */
var router 		= express.Router();

var checkLogin = function (req, res, next) {
	next ();
};

router.get('/', checkLogin, function (req, res) {
	res.render ('index', { }); 
});

router.get('/stats', checkLogin, function (req, res) {
	res.render ('stats', { delegates: delegateList, stats: stats, balances: balances, alive: alive });
});

exports.router = router;


/** Telegram bot */
var bot = new TelegramBot (config.telegram.token, {polling: true});

bot.on('message', function (msg) {
  var chatId = msg.chat.id;
  console.log (msg);
});
