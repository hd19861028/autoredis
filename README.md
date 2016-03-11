# auturedis

autoredis是一个数据库操作的帮助类，简单的描述就是，它能将mysql的查询结果自动存入redis集群之中，在缓存过期以前都不会再次从mysql中读取

<h3>配置</h3>

> 请按照下面的步骤正确的配置你的参数

1. 将config.json中的配置复制到你项目的配置文件中
2. 在你项目的启动文件中，按照index.js中第一行的做法，将配置正确的设置好
3. 或者你可以直接修改config.json文件中的配置
4. 最终global对象中结构如下所示
```javascript
      global.config={
          db:{
            ...
          },
          cache:{
            ...
          },
          mongo:{
            ...
          }
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

1. 普通查询
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
2. 事务查询
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

