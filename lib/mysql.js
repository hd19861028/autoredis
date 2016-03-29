/**
 * Git地址	：https://github.com/felixge/node-mysql
 * 作者		：胡锦柢
 * 时间		：2015-12-31 08:59
 * 描述		：pool添加error事件，用于重新创建连接池
 */
var mysql = require('mysql');
var pool = null;

var fs = require("fs");
var path = require("path");
var cache = require("./cache");
var q = require('q');
var bling = require("bling-hashes");

exports = module.exports;

function getHash(str) {
	return bling.bkdr(str);
}

/**
 * @param {Object} sql 待查询的sql语句，支持多语句的配置，需要在config.json中定义
 * @param {Object} params 数组类型，依次传入sql语句中？定义的参数
 * @param {Object} cache_key 如需自动加入redis缓存，请为该次查询定义一个特殊的key
 * @param {Object} isquery 是否是查询语句，默认false，实时性要求不高的查询语句，可以设置为true
 */
exports.query = function(sql, params, cache_key, isquery) {
	var ckey = "";
	isquery = isquery ? isquery : false;
	var whichDB = isquery ? "SLAVE*" : "MASTER";

	function autoCache() {
		if (cache_key && global.config.cache.enable) {
			if (cache_key.indexOf('?')) cache_key = cache_key.split('?')[0];
			if (params && params.length >= 0) ckey = params.join('_');

			ckey = cache_key + getHash(ckey);

			return cache.get(ckey)
		} else {
			return invoke();
		}
	}

	var invoke = function() {
		var deferFromDB = q.defer();
		if (!pool) {
			pool = mysql.createPoolCluster();
			pool.add('MASTER', global.config.db.master);
			pool.add('SLAVE1', global.config.db.slave1);
			pool.add('SLAVE2', global.config.db.slave2);
		}

		pool.getConnection(whichDB, function(err, conn) {
			if (err) {
				deferFromDB.reject(err);
			} else {
				var db = conn;
				var options = get_options(sql);
				if (params)
					options.sql = db.format(options.sql, params);
					
				db.on('error', function(fatalErr) {
					console.error(fatalErr)
				});
				db.query(options, function(err, rows, fields) {
					if (err) {
						deferFromDB.reject(err);
					} else {
						if (cache_key)
							cache.set(ckey, rows);
						var data = {};
						data.rows = rows;
						data.sql = this.sql;
						deferFromDB.resolve(data);
					}
					conn.release();
				});
			}
		});
		return deferFromDB.promise;
	}

	var d = q.defer();
	autoCache()
		.then(function(result) {
			var data = {};
			if (result.sql && result.rows) {
				data = result;
			} else {
				data.rows = result;
				data.sql = null;
			}
			d.resolve(data);
		}, function(err) {
			return invoke();
		})
		.then(function(result) {
			if (result) {
				d.resolve(result);
			}
		})

	return d.promise;
}

exports.transaction = function(sql_list, params_list, callback) {
	var trans = null;

	var querys = function(sql_list, params_list, callback) {
		var is_last = sql_list.length == 1 ? true : false;
		var options = get_options(sql_list.shift());
		var params = params_list.shift();
		trans.query(options, params, function(err, result) {
			if (err) {
				trans.rollback();
				callback(null, err);
			} else {
				if (is_last) {
					trans.commit(function(err) {
						if (err) {
							callback(null, err); //console.log(err);
						} else {
							callback(result, null); //console.log(result);
						}
					});
				} else {
					querys(sql_list, params_list, callback);
				}
			}
		});
	}

	var db = mysql.createConnection(global.config.db.master);
	init_tran(db, false);
	trans = db.startTransaction();
	if (sql_list.length >= 1) {
		querys(sql_list, params_list, callback);
		trans.execute();
	}
}

var get_options = function(sql) {
	var db_config = global.config.db;
	var options = {
		timeout: db_config.timeout,
		sql: sql
	};
	return options;
}

function init_tran(db, debug) {
	if (debug !== true) debug = false;
	var options = {
		debug: debug,
		currentlyExecutingQueue: null,
		mainQueue: []
	};
	var dbQuery = db.query;

	db.query = function(sql, params, cb) {
		if (options.currentlyExecutingQueue == null)
			return dbQuery.apply(db, arguments);
		else
			options.mainQueue.push(arguments);
	}
	db.createQueue = function() {
		return new Queue(function() {
			return dbQuery.apply(db, arguments);
		}, function() {
			var ceq = options.currentlyExecutingQueue;
			if (ceq != null && ceq.commit != null) {
				if (ceq._autoCommit !== true)
					console.warn("The last query to run was:", ceq.lastExecuted.sql);
				ceq.commit(ceq._autoCommitCB);
				return;
			}
			options.currentlyExecutingQueue = null;
			while (options.mainQueue.length > 0) {
				var item = options.mainQueue.shift();
				if (item instanceof Queue) {
					item.execute();
					break;
				} else
					dbQuery.apply(db, item);
			}
		}, options);
	}
	db.startTransaction = function() {
		return Queue.isNowTransaction(this.createQueue(), function() {
			return dbQuery.apply(db, arguments);
		});
	}
}

function Queue(dbQuery, resumeMainQueue, options) {
	this.queue = [];
	this.paused = false;
	this.query = function(sql, params, cb) {
		if (typeof params == "function") {
			cb = params;
			params = undefined;
		}
		this.queue.push({
			'sql': sql,
			'params': params,
			'cb': cb
		});
		return this;
	};
	this.execute = function() {
		if (this.paused === true || this.executing) return;
		var that = this;
		if (options.currentlyExecutingQueue != null && options.currentlyExecutingQueue != this)
			options.mainQueue.push(this);
		else if (that.queue.length > 0) {
			options.currentlyExecutingQueue = this;
			that.executing = true;
			var done = 0,
				total = that.queue.length;
			for (var i = 0; i < total; i++) {
				(function(item) {
					try {
						if (item.sql == "COMMIT") delete that.rollback;
						that.lastExecuted = item;
						dbQuery(item.sql, item.params || [], function() {
							if (options.debug && arguments[0] != null)
								console.error("mysql-queues: An error occurred while executing the following " +
									"query:\n\t", item.sql);
							if (item.cb != null)
								item.cb.apply(this, arguments);
							if (++done == total) {
								that.executing = false;
								if (that.paused === true) return;
								if (that.queue.length == 0)
									resumeMainQueue();
								else
									that.execute();
							}
						});
					} catch (e) {
						if (options.debug)
							console.log("mysql-queues: An exception occurred for this query:\n\t",
								item.sql, "\twith parameters:\n\t", item.params);
						throw e;
					}
				})(that.queue[i]);
			}
			that.queue = [];
		} else if (options.currentlyExecutingQueue == this)
			resumeMainQueue();
		return this;
	};
	this.pause = function(maxWaitTime) {
		this.paused = true;
		if (maxWaitTime > 0) {
			var that = this;
			that.pauseTimer = setTimeout(function() {
				that.resume();
			}, maxWaitTime);
		}
		return this;
	}
	this.resume = function() {
		if (this.pauseTimer)
			clearTimeout(this.pauseTimer);
		this.paused = false;
		this.execute();
		return this;
	}
}

Queue.isNowTransaction = function(q, dbQuery) {
	q.query("START TRANSACTION");
	q.commit = function(cb) {
		if (this.queue.length > 0) {
			this._autoCommit = true;
			this._autoCommitCB = cb;
			this.resume();
		} else {
			delete this.commit;
			delete this._autoCommit;
			this.query("COMMIT", cb).resume();
		}
	}
	q.rollback = function(cb) {
		this.queue = [];
		delete this.commit;
		delete this.rollback;
		dbQuery("ROLLBACK", cb);
		this.resume();
	}
	return q;
}