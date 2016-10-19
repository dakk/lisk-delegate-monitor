var express		= require ('express');
var request     = require ('request');
var async		= require ('async');
var TelegramBot = require('node-telegram-bot-api');

var log			= require ('./log');
var config      = require ('./config.json');


var delegateList = [];
var outsideList = [];
var stats = {
	delegates: 0,
	mined: 0,
	shift: 0
};
var balances = {};
var alive = {};
var votes = [];
var alerted = {};




/** Telegram bot */
var bot = new TelegramBot (config.telegram.token, {polling: true});


bot.onText(/\/help/, function (msg) {
	var fromId = msg.from.id;
	bot.sendMessage(fromId, 'Type /stats /table /reds');
});

bot.onText(/\/start/, function (msg) {
	var fromId = msg.from.id;
	bot.sendMessage(fromId, 'Type /stats /table /reds');
});

bot.onText(/\/stats/, function (msg) {
	var fromId = msg.from.id;
	bot.sendMessage(fromId, 'Delegates: ' + stats.delegates + ', Mined blocks: ' + stats.mined + ', Total shifts: ' + stats.shift + ', Red delegates: ' + stats.notalive);
});

bot.onText(/\/table/, function (msg) {
	var fromId = msg.from.id;

	var str = "";
	for (var i = 0; i < delegateList.length; i++) {
		var d = delegateList[i];
		str += d.rate + '\t' + d.username + '\t' + d.productivity + '\t' + d.approval + '\n'; 
	}
	str += "\nOutsiders:\n";
	for (var i = 0; i < outsideList.length; i++) {
		var d = outsideList[i];
		str += d.rate + '\t' + d.username + '\t' + d.productivity + '\t' + d.approval + '\n'; 
	}

	bot.sendMessage(fromId, str);
});


/** Data update */
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

									if (! (delegateList2[i].address in alerted))
										alerted [delegateList2[i].address] = 1;
									else
										alerted [delegateList2[i].address] += 1;

									/* Alert the first time and every 30 minutes */
									if (alerted [delegateList2[i].address] == 1 || alerted [delegateList2[i].address] % 180 == 0) {
										for (var z = 0; z < config.telegram.chatids.length; z++)
											bot.sendMessage (config.telegram.chatids[z], 'Warning! The delegate "' + delegateList2[i].username + '" (@' + config.telegram.users[delegateList2[i].username] + ') is in red state.');
									}
								} else {
									delete alerted [delegateList2[i].address];
								}
							}
						}

						request('http://' + config.node + '/api/delegates/?limit=101&offset=101&orderBy=rate:asc', function (error, response, body) {
							if (!error && response.statusCode == 200) {
								var data = JSON.parse(body);
								var outsideList2 = [];

								for (var i = 0; i < data.delegates.length; i++) {
									if (config.lobby.indexOf (data.delegates[i].username) != -1) {
										data.delegates[i].state = 2;
										stats2.mined += data.delegates[i].producedblocks;
										outsideList2.push (data.delegates[i]);
									}
								}
								outsideList = outsideList2;
								stats2.outsides = outsideList.length;
								delegateList = delegateList2;
								stats = stats2;

								log.debug ('Data', 'Data updated.');
							}
						});
					});
				}
			});			
		}
	});
};


exports.updateVotes = function () {
	log.debug ('Data', 'Updating votes data...');
	var votes2 = [];

	/* First row is the username row */
	var row = ['//'];
	for (var i = 0; i < delegateList.length; i++) {
		row.push (delegateList[i].username);
	}
	votes2.push ([row]);

	var calls = [];
	async.each(delegateList, function (d, callback) {
		calls.push (function (callback) {
			request ('http://' + config.node + '/api/accounts/delegates/?address=' + d.address, function (error, response, body) {
				var rrow = [d.username];
				if (!error && response.statusCode == 200) {
					var data = JSON.parse(body);

					for (var j = 0; j < delegateList.length; j++) {
						var r = false;
						for (var z = 0; z < data.delegates.length; z++) {
							if (data.delegates[z].address == delegateList[j].address) {
								r = true;
								break;
							}		
						}
						rrow.push (r);
					}
				}
				callback (null, rrow);
			});
		});
	});

	async.parallel(calls, function(err, row2) {
		votes2.push (row2);
	});
	votes = votes2;
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
	for (var i = 0; i < outsideList.length; i++) {
		request ('http://' + config.node + '/api/accounts?address=' + outsideList[i].address, function (error, response, body) {
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
	if ('key' in req.query && req.query.key == config.accesskey)
		next ();
	else
		res.status(500);
};

router.get('/', checkLogin, function (req, res) {
	res.render ('index', { }); 
});

router.get('/stats', checkLogin, function (req, res) {
	res.render ('stats', { delegates: delegateList, stats: stats, balances: balances, votes: votes, alive: alive, outsides: outsideList });
});

exports.router = router;
