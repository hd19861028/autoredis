var mysql = require('../index').mysql;
var cache = require('../index').cache;
var mongo = require('../index').mongo;

var num = 1;
var max = 3;
var cacheKey = 'testKey';

var timer = setInterval(function() {
	switch (num) {
		case 1:
			console.log('测试一：将mysql查询结果自动存入redis中')
			mysql.query('SELECT * FROM information_schema.TABLES limit 1', [], cacheKey)
				.then(function(data) {
					if (data.sql)
						console.log(('mysql查询成功'))
					if (!data.sql)
						console.log(('redis缓存命中'))
				}, function(err) {
					console.log(('mysql查询失败'))
				})
			break;
		case 2:
			console.log('测试二：自动判断redis中是否有值')
			mysql.query('SELECT * FROM information_schema.TABLES limit 1', [], cacheKey)
				.then(function(data) {
					if (data.sql)
						console.log(('mysql查询成功'))
					if (!data.sql)
						console.log(('redis缓存命中'))
				}, function(err) {
					console.log(('mysql查询失败'))
				})
			break;
		case 3:
			console.log('测试三：mongodb的test库中创建集合')
			cache.get(cacheKey)
				.then(function(data) {
					mongo.insert('testConnection', data).then(function(result) {
						console.log(('mongodb操作成功'))
					}, function(err) {
						console.log(('mongodb连接失败'))
					})
				})

			break;
	}
	if (max == num) {
		clearInterval(timer)
	}
	num++;
}, 800)