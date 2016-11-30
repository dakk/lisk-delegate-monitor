const express		= require ('express');
const request     = require ('request');
const TelegramBot = require ('node-telegram-bot-api');
const fs 			= require ('fs');
const waterfall	= require ('waterfall-ya');

var log			= require ('./log');

if (process.argv.length >= 3)
	var config      = require ('./' + process.argv[2]);
else
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
var height = 0;

/* Delegate monitor for PVT monitoring */
var delegateMonitor = {};

var saveDelegateMonitor = function () {
	fs.writeFile('monitor.json', JSON.stringify (delegateMonitor), function (err,data) {});
};
var loadDelegateMonitor = function () {
	try {
		return JSON.parse (fs.readFileSync('monitor.json', 'utf8'));
	} catch (e) {
		return {};
	}
};

delegateMonitor = loadDelegateMonitor ();



/** Telegram bot */						
if (config.telegram.enabled) {
	var bot = new TelegramBot (config.telegram.token, {polling: true});
	var botHelp = 'Type:\n\t/stats\n\t/table\n\t/reds\n\t/watch delegatename\n\t/unwatch delegatename\n\t/watched';

	bot.onText(/\/help/, function (msg) {
		var fromId = msg.from.id;
		bot.sendMessage(fromId, botHelp);
	});

	bot.onText(/\/start/, function (msg) {
		var fromId = msg.from.id;
		bot.sendMessage(fromId, botHelp);
	});

	bot.onText(/\/watch (.+)/, function (msg, match) {
	var fromId = msg.from.id;
	var delegate = match[1];

	if (config.lobby.indexOf (delegate) == -1) {
		bot.sendMessage(fromId, 'Delegate ' + delegate + ' is not part of the lobby.');
		return;
	}

	if (! (delegate in delegateMonitor))
		delegateMonitor [delegate] = [fromId];
	else
		delegateMonitor [delegate].push (fromId);

	saveDelegateMonitor ();
	log.debug ('Monitor', 'New watcher for: ' + delegate);

	bot.sendMessage(fromId, 'Delegate monitor of ' + delegate + ' is now enabled. You will receive a private message in case of red state.');
	});


	bot.onText(/\/unwatch (.+)/, function (msg, match) {
	var fromId = msg.from.id;
	var delegate = match[1];

	if (delegate in delegateMonitor) {
		var i = delegateMonitor[delegate].indexOf (fromId);
		if (i != -1) {
			delegateMonitor[delegate].splice (i, 1);
			saveDelegateMonitor ();
		}
	}
	log.debug ('Monitor', 'Removed watcher for: ' + delegate);

	bot.sendMessage(fromId, 'Delegate monitor of ' + delegate + ' is now disabled.');
	});


	bot.onText(/\/watched/, function (msg) {
		var fromId = msg.from.id;
		
		var message = "You are monitoring:\n";
		for (var d in delegateMonitor) {
			if (delegateMonitor[d].indexOf (fromId) != -1)
				message += '   ' + d + '\n';
		}
		
		bot.sendMessage(fromId, message);
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
}

/** Data update */
exports.update = function () {
	log.debug ('Data', 'Updating data...');

	var delegateList2 = [];
	var stats2 = { delegates: 0, mined: 0, shift: 0 };

	waterfall([
		function (next) {
			request('http://' + config.node + '/api/delegates/?limit=101&offset=0&orderBy=rate:asc', next);
		},
		function (error, response, body, next) {
			if (error || response.statusCode != 200)
				return log.critical ('Data', 'Failed to download delegate list from node.');

			var data = JSON.parse(body);

	   		for (var i = 0; i < data.delegates.length; i++) {
				if (config.lobby.indexOf (data.delegates[i].username) != -1) {
					stats2.delegates += 1;
					stats2.mined += data.delegates[i].producedblocks;
					data.delegates[i].state = 2;
					delegateList2.push (data.delegates[i]);
				}
			}

			for (var d in balances) {
				stats2.shift += Math.floor (balances[d] * 10) / 10;
			}

			request('http://' + config.node + '/api/blocks?limit=100&orderBy=height:desc', next);
		},
		function (error, response, body, next) {
			if (error || response.statusCode != 200)
				return log.critical ('Data', 'Failed to download block list from node.');

			var data = JSON.parse(body);
			request('http://' + config.node + '/api/blocks?limit=100&offset=100&orderBy=height:desc', next.bind (null, data));
		},
		function (data, error, response, body, next) {
			if (error || response.statusCode != 200)
				return log.critical ('Data', 'Failed to download block list from node.');

			var data2 = JSON.parse(body);
			data.blocks = data.blocks.concat (data2.blocks);

			alive = {};
			height = data.blocks[0].height;
			
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
						log.critical ('Monitor', 'Red state for: ' + delegateList2[i].username);

						/* Avvisa i canali registrati */
						if (config.telegram.enabled)
							for (var z = 0; z < config.telegram.chatids.length; z++)
								bot.sendMessage (config.telegram.chatids[z], 'Warning! The delegate "' + delegateList2[i].username + '" (@' + config.telegram.users[delegateList2[i].username] + ') is in red state.');

						/* Avvisa gli utenti registrati */
						if (config.telegram.enabled)
							if (delegateList2[i].username in delegateMonitor) {
								for (var j = 0; j < delegateMonitor [delegateList2[i].username].length; j++)
									bot.sendMessage (delegateMonitor [delegateList2[i].username][j], 'Warning! The delegate "' + delegateList2[i].username + '" (@' + config.telegram.users[delegateList2[i].username] + ') is in red state.');
							}
					}
				} else {
					delete alerted [delegateList2[i].address];
				}
			}

			request('http://' + config.node + '/api/delegates/?limit=101&offset=101&orderBy=rate:asc', next);
		},
		function (error, response, body, next) {
			if (error || response.statusCode != 200) 
				return log.critical ('Data', 'Failed to download outsider list 1 from node.');

			var data = JSON.parse(body);

			request('http://' + config.node + '/api/delegates/?limit=101&offset=201&orderBy=rate:asc', next.bind (null, data));
		},
		function (data, error, response, body, next) {
			if (error || response.statusCode != 200) 
				return log.critical ('Data', 'Failed to download outsider list 2 from node.');

			var data2 = JSON.parse(body);
			data.delegates = data.delegates.concat (data2.delegates);

			request('http://' + config.node + '/api/delegates/?limit=101&offset=301&orderBy=rate:asc', next.bind (null, data));
		},
		function (data, error, response, body) {
			if (error || response.statusCode != 200) 
				return log.critical ('Data', 'Failed to download outsider list 3 from node.');

			var data2 = JSON.parse(body);
			data.delegates = data.delegates.concat (data2.delegates);

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
	]);
};


exports.updateVotes = function () {
	log.debug ('Data', 'Updating votes data...');
	var votes2 = [];

	var dlist = delegateList.concat (outsideList);

	/* First row is the username row */
	var row = ['//'];
	for (var i = 0; i < dlist.length; i++) {
		row.push (dlist[i].username);
	}
	votes2.push (row);


	waterfall ([
		function (next) {
			next (0, next);
		},
		function (i, current, next) {
			if (i >= dlist.length)
				return next ();

			var d = dlist[i];
			
			request ('http://' + config.node + '/api/accounts/delegates/?address=' + d.address, function (error, response, body) {
				var rrow = [d.username];

				if (error || response.statusCode != 200)
					return current (i+1, current);

				var data = JSON.parse(body);

				for (var j = 0; j < dlist.length; j++) {
					var r = false;
					for (var z = 0; z < data.delegates.length; z++) {
						if (data.delegates[z].address == dlist[j].address) {
							r = true;
							break;
						}		
					}
					rrow.push (r);
				}

				votes2.push (rrow);
				return current (i+1, current);
			});
		},
		function () {
			votes = votes2;
			log.debug ('Data', 'Votes updated.');
		}
	]);
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
	for (var i = 0; i < config.addresses.length; i++) {
		request ('http://' + config.node + '/api/accounts?address=' + config.addresses[i], function (error, response, body) {
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
	res.render ('index', { coin: config.coin }); 
});

router.get('/stats', checkLogin, function (req, res) {
	res.render ('stats', { height: height, coin: config.coin, addresses: config.addresses, delegates: delegateList, stats: stats, balances: balances, votes: votes, alive: alive, outsides: outsideList });
});

exports.router = router;
