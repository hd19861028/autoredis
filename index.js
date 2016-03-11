if (!global.config) {
	global.config = require("./config");
} else {
	if (!global.config.db || !global.config.cache) {
		var json = require("./config");
		global.config.db = json.db;
		global.config.cache = json.cache;
	}
}

exports.cache = require('./lib/cache');
exports.mysql = require('./lib/mysql');
exports.mongo = require('./lib/mongo');