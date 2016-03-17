# autoredis

autoredis是一个数据库操作的帮助类，简单的描述就是，它能将mysql的查询结果自动存入redis集群之中，在缓存过期以前都不会再次从mysql中读取

安装方式

npm install autoredis

<h3>配置</h3>

> 请按照下面的步骤正确的配置你的参数

1. 将config.json中的配置复制到你项目的配置文件中
2. 在你项目的启动文件中，按照index.js中第一行的做法，将配置正确的设置好
3. 或者你可以直接修改config.json文件中的配置
4. 最终global对象中结构如下所示
```javascript
      global.config={
          db:{
            master:{...},
            slave1:{...},
            slave2:{...}
          },
          cache:{...},
          mongo:{...}
      }
```

<h3>mysql</h3>

> 它能做到的事情

1. 使用连接池进行操作，普通增删改查不用每次都打开关闭连接
2. 封装了事务操作
3. 传入特定的一个参数，当前查询结果会自动缓存到redis集群中

> 注意事项

1. 由于mysql本身的机制，连接池每隔8小时将自动断开长连接，虽然我加上了防止出错的设置，但是不保证永远不出错
2. 封装的事务操作的代码是从一位国外友人的github上抄来的，时间太长了忘记出处了
3. 事务操作的表，必须是inno引擎(这个龟腚自然不是我说了算的)

> 使用示范

普通查询

```javascript
var db = require('autoredis').mysql;

//cacheKey针对每一个查询都要设置一个不同的值
//在node.js中，最简单的唯一值就是req.originalUrl
var cacheKey = "testCacheKey";
var sql = 'SELECT * FROM tb_mem_user where mobile=?';
var param = ['18575608334']

db.query(sql, param, cacheKey)
	.then(function(data) {
		//data包含2个属性：sql, rows
		//sql为null表示命中缓存
		
	}, function(err) {
		
	})
```

事务查询

```javascript
var db = require('autoredis').mysql;

var ids = [1, 2, 3, 4, 5];

var sql_list = [];
var paras = [];
for (var i = 0; i < ids.length; i++) {
	sql_list.push("update tb_ad_info set isdeleted = true where id = ? and isdeleted = false");
	paras.push([ids[i]]);
}

db.transaction(sql_list, paras, function(rows, err) {
	if (err) {
		//失败
	} else {
		//成功
	}
});
```

<h3>redis</h3>

> 使用示范

设置缓存
```javascript
var cache = require('autoredis').cache;

//简单设置
cache.set('key', 'value')
//设置超时时间(单位：秒)
//超时时间设置0为删除缓存，设置-1为永不过期
cache.set('key', 'value', 300)
//利用回调
cache.set('key', 'value', 300, function(err, result){
	//result有值就是正确，为null就是失败
})
```
获取缓存
```javascript
var cache = require('autoredis').cache;

cache.get('key')
	.then(function(v){
		//不用再次判断，进入这里表示一定是拿到缓存了
	}, function(err){
		//err === "1" 表示不存在
		//err === "0" 表示配置文件中，cache节点的enable属性设置成了false，缓存未启动
		//err返回了一个错误对象，表示拿缓存的过程中，有某个步骤执行异常
	})
```

<h3>mongo</h3>

> 使用示范

添加引用
```javascript
var mongo = require('autoredis').mongo;
```
获取集合并进行增删改查
```javascript
mongo.collections('media')
	.then(function(list) {
		list.insert({type:'manga', title: 'one piece', volumes: 612, read:521})
		list.update({title: 'one piece'}, {$inc: {read:4}})
		list.update({title: 'one piece'}, {$set: {genre:'sci-fi'}})
		list.update({title: 'one piece'}, {$push: {author:{$each: ['griffin,peter', 'griffin,brian']}}})
		list.update({title: 'one piece'}, {$push: {author:{$each: ['griffin,meg', 'griffin,louis'], $slice: -2}}})
		list.update({title: 'one piece'}, {$addToSet: {author:{$each: ['griffin,peter', 'griffin,brian']}}})
		list.update({title: 'one piece'}, {$pop: {author:1}})
		list.update({title: 'one piece'}, {$pull: {author:'griffin,peter'}})
		list.update({title: 'one piece'}, {$pullAll: {author:['griffin,louis']}})
		
		list.find({title: 'one piece'}).toArray(function(err, r){console.log(r);})
	})
	.catch(function(err) {
		console.error(err)
	})
```
创建索引
```javascript
mongo.ensureIndex('media', { price: 1 })
	.then(function(r) {
		console.log(r)
	})
```
原子操作，查找并且更新
```javascript
mongo.findOneAndUpdate(
		'media', 
		{ title: 'one piece' }, 
		{ genre: 'sci-fi4' },
		{
			sort: { title: -1 }, 
			returnOriginal: false,
			upsert: false,
			maxTimeMS: 100
		})
	.then(function(result) {
		console.log('findOneAndUpdate')
		console.log(result)
	})
	.catch(function(err) {
		console.error(err)
	})
```
创建表关联(DBRef类型)
```javascript
mongo.collections("parent")
	.then(function(db) {
		db.save({
			title: 'parent'
		}).then(function(r) {
			console.log(r.ops._id)
		})
	})

mongo.collections("child")
	.then(function(db) {
		//创建关联
		db.save({
			title: 'child2',
			ref: mongo.newDBRef('parent', '56ca863a5e33ae1046cd931c')
		}).then(function(r) {
			console.log(r.ops)
		})
		
		//按关联条件提取数据
		db.find({
			title: 'child'
		}).toArray(function(err, r) {
			var l = r[0].ref;

			l.fetch().then(function(result) {
				console.log(result)
			})
		})
	})
```
Map-Reduce操作
```javascript
mongo
	.collections("testgroup")
	.then(function(db) {
		var map = function() {
			var value = {
				num: this.num,
				count: 1
			};
			emit(this.name, value)
		};
		var reduce = function(name, val) {
			reduceValue = {
				num: 0,
				count: 0
			};
			for (var i = 0; i < val.length; i++) {
				reduceValue.num += val[i].num;
				reduceValue.count += val[i].count;
			}
			return reduceValue;
		};
		var finalize = function(key, value) {
			value.avg = parseInt(value.num / value.count);
			return value;
		};
		var options = {
			query: { num: { $gt: 500 } },
			out: { inline: 1 },
			verbose: true,
			finalize: finalize
		};
		var callback = function(err, result, timeResult) {
			console.log(result)
			console.log(timeResult);
		}
		db.mapReduce(map, reduce, options, callback)
	})
```
