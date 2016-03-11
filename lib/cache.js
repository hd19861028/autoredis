var redis = require('thunk-redis')
var q = require('q');
var config = null;

exports = module.exports;

function createConnections(key) {
	if (config == null) config = global.config.cache;
	var cluster = null;

	if (config.enable) {
		var ops = config.options;
		cluster = redis.createClient(config.nodes, ops);

		cluster.on('connect', function() {
			//console.log('redis connected!')
		})

		cluster.on('error', function() {
			//console.log('redis error!')
		})
	}

	return cluster;
}

function get_db_count(key) {
	return key.length % config.db_count;
}

exports.set = function(key, obj, timeout, callback) {
	var cluster = createConnections(key);

	if (config.enable) {
		obj = JSON.stringify(obj);
		cluster.select(get_db_count(key))
			.then(function() {
				return cluster.set(key, obj)
			})
			.then(function(r) {
				if (timeout == undefined || timeout == null) {
					timeout = config.expire;
				}
				return cluster.expire(key, timeout);
			})
			.then(function(r) {
				if (callback)
					callback(null, r);
			})
			.catch(function(err) {
				if (callback)
					callback(err, null);
			})
	} else {
		if (callback)
			callback(null, null);
	}
};

exports.get = function(key) {
	var cluster = createConnections();
	var d = q.defer();

	if (config.enable) {
		cluster.select(get_db_count(key))
			.then(function(r) {
				return cluster.exists(key);
			})
			.then(function(r) {
				if (r == 1)
					return cluster.get(key)
				else
					d.reject("1");
			})
			.then(function(r) {
				if (r) d.resolve(JSON.parse(r))
			})
			.catch(function(err) {
				d.reject(err);
			})

	} else {
		d.reject("0");
	}

	return d.promise;
};
