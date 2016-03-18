var mongo = require('mongodb');
var client = mongo.MongoClient;

var q = require('q');
var database = null;

var test = {
	host: "172.16.3.190",
	user: "test",
	password: "123",
	database: "test",
	port: 22222
};

function getConnection() {
	var d = q.defer();
	if (database == null) {
		var config = global.config || test;
		var host = config.host || test.host || '';
		var port = config.port || test.port || '';
		var dbconfig = config.database || test.database || '';
		var user = config.user || test.user || '';
		var pwd = config.password || test.password || '';
		var auth = '';
		if (user && pwd) auth = user + ':' + pwd + '@';
		var url = 'mongodb://' + auth + host + ':' + port + '/' + dbconfig;
		
		client.connect(url, function(err, db) {
			if (err == null) {
				database = db;
				d.resolve(database);
			} else {
				d.reject(err);
			}
		});
	} else {
		d.resolve(database);
	}

	return d.promise;
}

exports = module.exports;

exports.close = function(){
	if(database) database.close();
	database = null;
};

/**
 * @table: 插入的集合名称
 * @data: 插入的数据
 * @returns: 返回一个数组，插入成功的ids集合
 */
exports.insert = function(table, data) {
	var d = q.defer();
	var inserted = [];
	if (!Array.isArray(data)) {
		inserted.push(data)
	} else {
		inserted = data;
	}
	getConnection().then(function(db) {
		var collection = db.collection(table);
		collection.insertMany(inserted, function(err, result) {
			db.close();
			if (err) d.reject(err);
			else d.resolve(result.insertedIds);
		});
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 更新的集合名称
 * @filter: 更新数据的条件(你需要更新哪条数据)
 * @data: 需要被更新的数据(只包含需要更新的字段即可，不更新的字段不需要包含进来)
 * @returns: [ok:1, nModified:3, n:0]
 */
exports.update = function(table, filter, data) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		collection.update(filter, {
			$set: data
		}, {
			upsert: false, //如果设置为true，则存在就更新，不存在则创建
			multi: true //是否更新多行
		}, function(err, result) {
			db.close();
			if (err) d.reject(err);
			else d.resolve(result.result);
		});
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 删除的集合名称
 * @filter: 删除数据的条件(你需要删除哪些数据)
 * @returns: [ok:1, n:0]
 */
exports.delete = function(table, filter) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		collection.deleteMany(filter, function(err, result) {
			db.close();
			if (err) d.reject(err);
			else d.resolve(result);
		});
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 更新的集合名称
 * @filter: 更新数据的条件(你需要更新哪条数据)
 * @data: 需要被更新的数据(只包含需要更新的字段即可，不更新的字段不需要包含进来)
 * @options: object类型，包含4个属性，sort, returnOriginal, upsert, maxTimeMS
 * @returns: 返回一个承诺对象
 */
exports.findOneAndUpdate = function(table, filter, data, options) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		var set = {};
		set.$set = data;
		options = options || {
			returnOriginal: false,
			upsert: false,
			maxTimeMS: 20
		}
		var value = collection.findOneAndUpdate(filter, set, options);
		db.close();
		d.resolve(value);
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 集合名称
 * @filter: 条件(你需要删除哪条数据)
 * @sort: 数组对象，删除数据根据什么排序
 * @options: object类型，包含2个属性，w, j
 * 		这2个参数对于返回的数据没有影响，只是调整了操作的可靠性
 * 		w=0(默认值)：操作完成后不获取最后的错误信息
 *     w=1：操作完成后返回错误信息
 * 		j=false(默认值)：操作完成后不等待数据同步到硬盘
 *     j=true：操作完成后等待数据同步到硬盘之后再返回
 * @returns: 返回一个承诺对象
 */
exports.findAndRemove = function(table, filter, sort, options) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		options = options || {
			returnOriginal: false,
			upsert: false,
			maxTimeMS: 20
		}
		var value = collection.findAndRemove(filter, sort, options);
		db.close();
		d.resolve(value)
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 集合名称
 * @filter: 条件(你需要删除哪条数据)
 * @options: object类型，包含2个属性，sort, maxTimeMS
 * @returns: 返回一个承诺对象
 */
exports.findOneAndDelete = function(table, filter, options) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		options = options || {
			maxTimeMS: 20
		}
		var value = collection.findOneAndDelete(filter, options);
		db.close();
		d.resolve(value)
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 删除的集合名称
 * @returns: 返回一个集合
 */
exports.collections = function(table) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);

		d.resolve(collection);
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}

/**
 * @table: 删除的集合名称
 * @filter: 删除数据的条件(你需要删除哪些数据)
 * @only: 可空参数，如果传入{title:1}，则表示返回的结果中只包含title字段，并且按照升序显示，0表示只不显示title字段，其余字段显示
 * @returns: 返回一个表达式exp，如下方式使用
        返回结果
 		exp.toArray(function(err, result) {
			
		})
		传入排序条件
		exp.sort({title: 1})
		设置limit
		exp.limit(10)
		设置skip
		exp.skip(1)
 */
exports.where = function(table, filter, only) {
	var d = q.defer();
	getConnection().then(function(db) {
		var collection = db.collection(table);
		d.resolve(collection.find(filter, only));
	}, function(err) {
		d.reject(err);
	})
	return d.promise;
}


var ObjectID = mongo.ObjectID;
exports.ObjectID = ObjectID;

var DBRef = mongo.DBRef;

DBRef.prototype.fetch = function() {
	var d = q.defer();
	var table = this.namespace;
	var filter = {
		_id: this.oid
	};

	getConnection().then(function(db) {
		var collection = db.collection(table);
		collection.find(filter).toArray(function(err, r) {
			db.close();
			d.resolve(r);
		})
	}, function(err) {
		d.resolve(null);
	})
	return d.promise;
}

exports.DBRef = DBRef;

exports.newDBRef = function(table, id) {
	var oid = new ObjectID(id);
	var ref = new DBRef(table, oid);
	return ref;
}

/**
 * 用于创建单索引或者复合索引
 * @table: 集合名称
 * @filter: 创建索引的条件，1为升序，-1为降序
 * 		例如：{a:1,b:-1}表示创建了一个复合索引，先按照a字段升序，再按照b字段降序
 * @options: 
 * @param {boolean} [options.unique=false] 创建唯一索引.
 * @param {boolean} [options.sparse=false] 创建松散索引. 松散索引只会让指定字段不为空的行参与到索引创建中来。
 * @param {boolean} [options.background=false] 默认创建索引会将数据行独占，数据量大时会造成重大延时。将此字段设置成true，创建索引会暂停，等待写入操作完成再继续进行
 * @param {boolean} [options.dropDups=false] 强制将重复的数据行删除
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] 指定索引的版本格式.
 * @param {number} [options.expireAfterSeconds=null] 允许设置索引的过期时间 (MongoDB 2.2以上版本支持)
 * @param {number} [options.name=null] 覆盖自动生成的索引名称 (如果生成的索引名称大于128字节，这会很有用)
 */
exports.ensureIndex = function(table, filter, options) {
	var d = q.defer();
	options = options || {
		background: true
	}
	getConnection().then(function(db) {
		var collection = db.collection(table);
		var value = collection.ensureIndex(filter, options);
		db.close();
		d.resolve(value);
	}, function(err) {
		d.resolve(null);
	})
	return d.promise;
}