
/** WATERFALL */
var nextTick = function (fn) {
    if (typeof setImmediate === 'function') {
      setImmediate(fn);
    } else if (typeof process !== 'undefined' && process.nextTick) {
      process.nextTick(fn);
    } else {
      setTimeout(fn, 0);
    }
};

var makeIterator = function (tasks) {
    var makeCallback = function (index) {
      var fn = function () {
        if (tasks.length) {
          tasks[index].apply(null, arguments);
        }
        return fn.next();
      };
      fn.next = function () {
        return (index < tasks.length - 1) ? makeCallback(index + 1): null;
      };
      return fn;
    };
    return makeCallback(0);
};

var _isArray = Array.isArray || function(maybeArray){
    return Object.prototype.toString.call(maybeArray) === '[object Array]';
};

var waterfall = function (tasks, callback) {
	callback = callback || function () {};

	if (!_isArray(tasks)) { return callback (); }
	if (!tasks.length) { return callback (); }

	var wrapIterator = function (iterator) {
		return function (err) {
			var args = Array.prototype.slice.call(arguments);
			var next = iterator.next();

			if (next) {
				args.push (wrapIterator (next));
			} else {
				args.push (callback);
			}

			nextTick(function () {
				iterator.apply(null, args);
			});
		};
	};

    wrapIterator(makeIterator(tasks))();
};

exports.waterfall = waterfall;