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

rl.question('请输入b站视频地址:', (userstdin) => {
  // TODO: Log the answer in a database
  // console.log('check:', userstdin);
  if(userstdin.match('bilibili')){
  	downbilibilivideo(userstdin);
  }
  else{
  	process.abort();
  	console.log('请输入正确的地址');
  }
  rl.close();
});
// var userstdin="http://bangumi.bilibili.com/anime/v/91061";
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
	    	res.on('data',function(data) {
				  file.write(data)
				  if(process.stdout){
				  	process.stdout.write('#');
				  }else{
				  	console.log('downloading'); 						  	
				  }
	    	})
	    	res.on('end',function() {
	    		// if(i>=0 && i<result.video.durl){
	    		// 	i++;
	    		// 	downloadfile(result.video.durl[i].url[0],file,i,result);
	    		// }else{
	    			file.end();
	    			if(process.stdout){
		    		process.stdout.write('||OK\ncompleted!\n');//文件被保存
					 }else{
					  	console.log('completed!'); 						  	
					 } 	
					// process.abort();	
	    // 		}
	    // 		if(flag==1){
		   //  		file.end();
		   //  		if(process.stdout){
		   //  		process.stdout.write('||OK\ncompleted!\n');//文件被保存
					//  }else{
					//   	console.log('completed!'); 						  	
					//  } 	
					// process.abort();		
	    // 		}
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
	  					var flag = 0;
	  					var file;
	  					// var i = 0;
	  					for (var i in result.video.durl) {
	  						var videourl = result.video.durl[i].url[0];
		  					var type = result.video.format[0];
		  					type = selecttype(type);
		  					if(type==null){
		  						return null;
		  					}
						    console.log('fetch from:'+videourl);
						    var filename = cid+'-'+i+'.'+type;
						    if(process.stdout){
								  	process.stdout.write('start downloading '+filename);
							}else{
								  	console.log('start downloading '+filename); 						  	
							}
							// if(i >= (result.video.durl.length-1)){
							// console.log(i +' '+ result.video.durl.length);
							// 	flag = 1;
							// }
							// fs.exists(filename, function (exists) {
							//   if(!exists){
							file = fs.createWriteStream(filename);
							  // }
							  downloadfile(videourl,file,i,result);
							//   if(flag==1) return;
							// });
							  // if(flag==1) return;
	  					}
					});
	  			})
	  		})
	}
	function getcid(cid) {
		var appkey='85eb6835b0a1034e';  
		var secretkey = '2ad42749773c441109bdc0191257a664'
		var code = md5.update('appkey=' + appkey + '&cid=' + cid + secretkey).digest('hex');
		var requesturl = 'http://interface.bilibili.com/playurl?appkey=' + appkey + '&cid=' + cid + '&sign=' + code;
		console.log(requesturl);
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
