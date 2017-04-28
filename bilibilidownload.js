var http = require('http');
var url = require('url');
var cheerio = require('cheerio');
var zlib = require('zlib');
var fs = require('fs');
var gunzipStream = zlib.createGunzip();
var crypto = require('crypto');
var md5 = crypto.createHash('md5');
var parseString = require('xml2js').parseString;
var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
console.log('    \\　　　/         /＼7　　　 ∠＿/ ');
console.log('　   \\　　/ 　   　 /　│　　 ／　／ ');
console.log('　 ___\\__/___　 　 │　Z ＿,＜　／　　 /`ヽ ');
console.log('  │　　　　　|　　│　　　　　ヽ　　 /　　〉 ');
console.log('  | / 　   \\ |  　 Y　　　　　`　 /　　/ ');
console.log('  │　　　　　|　　ｲ●　､　●　　⊂⊃〈　　/ ');
console.log('  │　\\_/\\_/  |　　()　 へ　　　　|　＼〈 ');
console.log('  │　　　　　|　　　>ｰ ､_　 ィ　 │ ／／ ');
console.log('   ￣￣￣￣￣ 　  / へ　　 /　ﾉ＜| ＼＼ ');
console.log('                 ヽ_ﾉ　　(_／　 │／／ ');
console.log('                 7　　　　　　　|／ ');
console.log('                 ＞―r￣￣`ｰ―＿| ');
rl.question('请输入b站视频地址:', (userstdin) => {
  if(userstdin.match('bilibili')){
  	downbilibilivideo(userstdin);
  }
  else{
  	console.log('请输入b站视频的地址');
  	process.abort();
  }
  rl.pause();
});

function downbilibilivideo(userstdin) {
	var temp = userstdin.split('/').pop();
	var aid;
	if(temp){
		if(temp.match('av')){
			aid=temp.split('av')[1];
			userstdin+='/';
		}else{
			aid=temp;
		}
	}

	var urlobj = url.parse(userstdin);

	var options = {
		 hostname: urlobj.host,
		 path: urlobj.path,
		 port: urlobj.post,
		 headers: {
		  'Accept-Encoding': 'gzip'
		 }
	}


	http.get(options, function(res) {
		if(res.headers['content-encoding'].indexOf('gzip') != -1) {
		  	// 解压gzip
		  	console.log('start analyze html');
		  	analyzehtml(res);
	 	}else{
	 		console.log('can`t get right data');
	 	}
	});
	function downloadfile(videourl,file,i,result) {
	    http.get(videourl,function(res) {
	    	var datalength = 0;
	    	res.on('start',function() {
				console.log(' ');
	    	})
	    	res.on('data',function(data) {
	    		datalength +=data.length;
	    		// console.log(data.length+'/'+datalength);
	    		var alldata = Number(result.video.durl[i].size[0]);
	    		var precent = datalength/alldata;
				  file.write(data);
					  if(process.stdout){
						readline.cursorTo(process.stdout, 0, process.stdout.rows-Number(i)-1);
					  	// process.stdout.cursorTo(0);
					  	process.stdout.write('video-'+(Number(i)+1)+'is downloading '+precent*100+'% speed:'+data.length+'/res');
					  	readline.clearLine(process.stdout,1);
					  }else{
					  	console.log('downloading'); 						  	
					  }
				  
	    	})
	    	res.on('end',function() {
	    			file.end();
	    			if(process.stdout){
						readline.cursorTo(process.stdout, 0, process.stdout.rows-Number(i));
		    			process.stdout.write('download completed!\n');//文件被保存
					  	readline.clearLine(process.stdout,1);
					 }else{
					  	console.log('completed!'); 						  	
					 } 	
	    	})
	    })
	}
	function selecttype(type) {
		if(type=="hdmp4" || type=="mp4"){
			type = 'mp4';
		}
		else if(type=="flv"){
			type = 'flv';
		}
		else if(type=="f4v"){
			type = 'f4v';
		}
		else if(type ="hdflv2"){
			type = 'flv';
		}
		else {
			console.log('data error!');
			return null;
		}
		return type;
	}
	function geturl(requesturl,cid) {
		http.get(requesturl,function(res) {
	  			var xml='';
	  			res.on('data',function(data) {
	  				xml+=data;
	  			})
	  			res.on('end',function() {
	  				parseString(xml, function (err, result) {
	  					console.log('总计'+result.video.durl.length+'个视频分段');
	  					for (var i in result.video.durl) {
	  						var videourl = result.video.durl[i].url[0];
		  					var type = result.video.format[0];
		  					type = selecttype(type);
		  					if(type==null){
		  						return null;
		  					}
						    console.log('fetch from:'+videourl);
						    var filename = 'download/' + cid+'-'+(Number(i)+1)+'.'+type;
						    if(process.stdout){
								  	process.stdout.write('start downloading '+filename+'\n');
							}else{
								  	console.log('start downloading '+filename); 						  	
							}
							var file = fs.createWriteStream(filename);
							 downloadfile(videourl,file,i,result);
	  					}
					});
					console.log(' ');
	  			})
	  		})
	}
	function getcid(cid) {
		var appkey='f3bb208b3d081dc8';
		var secretkey = '1c15888dc316e05a15fdd0a02ed6584f'
		var code = md5.update('appkey=' + appkey + '&cid=' + cid + '&from=miniplay&player=1&quality=1&type=mp4' + secretkey).digest('hex');
		var requesturl = 'http://interface.bilibili.com/playurl?&appkey=' + appkey + '&cid=' + cid +  '&from=miniplay&player=1&quality=1&type=mp4' + '&sign=' + code;
		// console.log(requesturl);
		geturl(requesturl,cid); 
	}
	function analyzehtml(res) {
		res.pipe(gunzipStream);
	  	var html = '';
	  	gunzipStream.on('data',function(data) {
	  		html += data;
	  	})
	  	gunzipStream.on('end', function() {
	  		var $ = cheerio.load(html);
	  		var spiltonce =$.html().split('cid=')[1];
	  		// console.log(spiltonce);
	  		var cid;
	  		if(!spiltonce){
	  			if(aid){
	  				Ogetcid(aid);
	  			}else{
	  				console.log('wrong url');
					return;
	  			}
	  		}else{
	  			cid = spiltonce.split('&aid=')[0];
	  			getcid(cid);
	  		}
	  	})
	}
	function Ogetcid(aid) {
		var cid;
		var params = 'episode_id='+aid;
		var postoptions = {
			host:'bangumi.bilibili.com',
			path:'/web_api/get_source',
			method:'POST',
			headers:{
				'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
				'Content-Length':params.length
			}
		}
		// console.log(params.length);
		var req = http.request(postoptions,function(res) {
			res.setEncoding('utf8');
			var resjson = '';
			res.on('data', function (data) {
			resjson += data;
			})
			res.on('end', function(){
				var resobj = JSON.parse(resjson);
				cid = resobj.result.cid;
					if(cid){
						// console.log(cid);
						getcid(cid);
						return cid;
					}else{
						console.log('can`t get cid!');
						return;
					}
			});
		})
		req.write(params);
		req.end();
	}
}
