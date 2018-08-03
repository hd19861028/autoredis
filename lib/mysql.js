/**
 * Git地址	：https://github.com/felixge/node-mysql
 * 作者		：胡锦柢
 * 时间		：2015-12-31 08:59
 * 描述		：pool添加error事件，用于重新创建连接池
 */
var mysql = require('mysql');

var fs = require("fs");
var path = require("path");
var q = require('q');

exports = module.exports;

function print(sql, params, stack) {
	var msg = ""
	if(stack) msg = ` \n${stack}`
	console.log(`mysql query error\n date: ${new Date().toLocaleString()} \n sql:${sql} \n params: ${JSON.stringify(params || [])} ${msg}`);
}

/**
 * @param {Object} sql 待查询的sql语句，支持多语句的配置，需要在config.json中定义
 * @param {Object} params 数组类型，依次传入sql语句中？定义的参数
 */
exports.queryFn = function(sql, params, callback) {
	var connection = mysql.createConnection(global.config.db.master);

	if(!sql) {
		var err = new Error("SQL语句不能是空");
		Error.captureStackTrace(err);
		callback(err, null)
		return;
	}
	connection.connect(function(err) {
		if(err) {
			callback(err, null)
		} else {
			try {
				var options = get_options(sql);
				if(params)
					options.values = params;
				connection.query(options, function(err, rows, fields) {
					if(err) {
						err.sql = sql;
						Error.captureStackTrace(err);
						print(sql, params, err.stack);
						callback(err, null);
					} else {
						var data = {};
						data.rows = rows;
						data.sql = this.sql;
						callback(null, data);
					}
					connection.destroy();
				});
			} catch(err) {
				print(sql, params);
				err.sql = sql;
				Error.captureStackTrace(err);
				callback(err, null);
				connection.destroy();
			}
		}
	});

}

exports.transactionFn = function(sql_list, params_list, callback) {
	var trans = null;

	var querys = function(sql_list, params_list, callback) {
		var is_last = sql_list.length == 1 ? true : false;
		var options = get_options(sql_list.shift());
		var params = params_list.shift();
		trans.query(options, params, function(err, result) {
			if(err) {
				trans.rollback();
				err.sql = options.sql;
				callback(err, null);
			} else {
				if(is_last) {
					trans.commit(function(err) {
						if(err) {
							callback(err, null);
						} else {
							callback(null, result); //console.log(result);
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
	if(sql_list.length >= 1) {
		querys(sql_list, params_list, callback);
		trans.execute();
	}
}

/**
 * @param {Object} sql 待查询的sql语句，支持多语句的配置，需要在config.json中定义
 * @param {Object} params 数组类型，依次传入sql语句中？定义的参数
 */
exports.query = function(sql, params) {
	return new Promise(function(resolve, reject) {
		exports.queryFn(sql, params, function(err, result) {
			if(err) {
				print(sql, params);
				reject(err);
			} else {
				resolve(result)
			}
		})
	})
}

exports.transaction = function(sql_list, params_list) {
	return new Promise(function(resolve, reject) {
		exports.transactionFn(sql_list, params_list, function(err, result) {
			if(err) {
				reject(err);
			} else {
				resolve(result)
			}
		})
	})
}

function get_options(sql) {
	var db_config = global.config.db;
	var options = {
		timeout: db_config.timeout,
		sql: sql
	};
	return options;
}

function init_tran(db, debug) {
	if(debug !== true) debug = false;
	var options = {
		debug: debug,
		currentlyExecutingQueue: null,
		mainQueue: []
	};
	var dbQuery = db.query;

	db.query = function(sql, params, cb) {
		if(options.currentlyExecutingQueue == null)
			return dbQuery.apply(db, arguments);
		else
			options.mainQueue.push(arguments);
	}
	db.createQueue = function() {
		return new Queue(function() {
			return dbQuery.apply(db, arguments);
		}, function() {
			var ceq = options.currentlyExecutingQueue;
			if(ceq != null && ceq.commit != null) {
				if(ceq._autoCommit !== true)
					console.warn("The last query to run was:", ceq.lastExecuted.sql);
				ceq.commit(ceq._autoCommitCB);
				return;
			}
			options.currentlyExecutingQueue = null;
			while(options.mainQueue.length > 0) {
				var item = options.mainQueue.shift();
				if(item instanceof Queue) {
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
		if(typeof params == "function") {
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
		if(this.paused === true || this.executing) return;
		var that = this;
		if(options.currentlyExecutingQueue != null && options.currentlyExecutingQueue != this)
			options.mainQueue.push(this);
		else if(that.queue.length > 0) {
			options.currentlyExecutingQueue = this;
			that.executing = true;
			var done = 0,
				total = that.queue.length;
			for(var i = 0; i < total; i++) {
				(function(item) {
					try {
						if(item.sql == "COMMIT") delete that.rollback;
						that.lastExecuted = item;
						dbQuery(item.sql, item.params || [], function() {
							if(options.debug && arguments[0] != null)
								console.error("mysql-queues: An error occurred while executing the following " +
									"query:\n\t", item.sql);
							if(item.cb != null)
								item.cb.apply(this, arguments);
							if(++done == total) {
								that.executing = false;
								if(that.paused === true) return;
								if(that.queue.length == 0)
									resumeMainQueue();
								else
									that.execute();
							}
						});
					} catch(e) {
						if(options.debug)
							console.log("mysql-queues: An exception occurred for this query:\n\t",
								item.sql, "\twith parameters:\n\t", item.params);
						throw e;
					}
				})(that.queue[i]);
			}
			that.queue = [];
		} else if(options.currentlyExecutingQueue == this)
			resumeMainQueue();
		return this;
	};
	this.pause = function(maxWaitTime) {
		this.paused = true;
		if(maxWaitTime > 0) {
			var that = this;
			that.pauseTimer = setTimeout(function() {
				that.resume();
			}, maxWaitTime);
		}
		return this;
	}
	this.resume = function() {
		if(this.pauseTimer)
			clearTimeout(this.pauseTimer);
		this.paused = false;
		this.execute();
		return this;
	}
}

Queue.isNowTransaction = function(q, dbQuery) {
	q.query("START TRANSACTION");
	q.commit = function(cb) {
		if(this.queue.length > 0) {
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