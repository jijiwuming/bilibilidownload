/*
const ffmpegPath = 'C:/ffmpeg/bin/ffmpeg.exe'
const ffprobePath = 'C:/ffmpeg/bin/ffprobe.exe'
const flvtoolPath = 'C:/ffmpeg/bin/ffplay.exe'
 */
let params = process.argv.splice(2)
let [ffmpegPath, ffprobePath, flvtoolPath] = params
let { appkey, secretkey } = require('./config')
const crypto = require('crypto')
const readline = require('readline')
const url = require('url')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const { Console } = require('console')
const ffmpeg = require('fluent-ffmpeg')
const myConsole = new Console(process.stdout, process.stderr)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})
// 循环获取输入
function getStdin() {
    rl.question('请输入b站视频地址:', async userstdin => {
        rl.pause()
        if (userstdin) {
            await analyzehtml(userstdin).catch(e => {
                // myConsole.dir(e)
                myConsole.log('Σ( ° △ °|||)︴粗问题了：' + e.message + '\n')
            })
        }
        // 再恢复输入接收状态
        rl.resume()
        getStdin()
    })
}
// 基础请求地址
let bangumiBaseOptions = {
    protocol: 'https:',
    hostname: 'bangumi.bilibili.com',
    pathname: '/player/web_api/v2/playurl'
}
let videoBaseOptions = {
    protocol: 'https:',
    hostname: 'interface.bilibili.com',
    pathname: '/v2/playurl'
}
/**
 * 获取签名参数
 *
 * @param {Object} [{
 *     cid,
 *     moduleType = undefined,
 *     otype = 'json',
 *     qn = 32,
 *     quality = 32,
 *     season_type = undefined,
 *     type = undefined
 * }={}]
 * @returns {Object}
 */
function getParams({
    cid,
    moduleType = undefined,
    otype = 'json',
    qn = 32,
    quality = 32,
    season_type = undefined,
    type = undefined
} = {}) {
    let md5 = crypto.createHash('md5')
    let sign = md5
        .update(
            `appkey=${appkey}&cid=${cid}${
                moduleType ? '&module=' + moduleType : ''
            }&otype=${otype}&qn=${qn}&quality=${quality}${
                season_type ? '&season_type=' + season_type : ''
            }&type=${(type ? type : '') + secretkey}`
        )
        .digest('hex')
    let obj = {
        appkey,
        cid,
        otype,
        qn,
        quality,
        type,
        sign
    }
    if (moduleType) {
        Object.assign(obj, {
            module: moduleType
        })
    }
    if (season_type) {
        Object.assign(obj, {
            season_type
        })
    }
    return obj
}
/**
 * 获取路由参数
 *
 * @param {string} originStr 原串
 * @param {string} param 要提取的路由参数名
 * @returns {Array} 参数值数组
 */
function getUrlParamArr(originStr, param) {
    let regStr = new RegExp(`[\\?\\&]${param}=[^#\\&]*`, 'gi')
    if (!originStr || originStr === '') {
        return []
    }
    let arr = originStr.match(regStr)
    if (arr) {
        return arr.map(i => decodeURI(i.substring(i.indexOf('=') + 1)))
    } else {
        return []
    }
}
/**
 * 封装json格式的http请求操作
 *
 * @param {string} requrl 请求地址
 * @returns {Promise}
 */
function getRequest(requrl) {
    let regex = new RegExp('^application/json', 'i')
    let reqmoudule = http
    if (requrl.startsWith('https://')) {
        reqmoudule = https
    }
    return new Promise((resolve, reject) => {
        reqmoudule
            .get(requrl, res => {
                const { statusCode } = res
                const contentType = res.headers['content-type']
                let error
                if (statusCode !== 200) {
                    error = new Error(`请求失败,状态码: ${statusCode}\n`)
                } else if (regex && !regex.test(contentType)) {
                    error = new Error(
                        `无效的 content-type.获取的是 ${contentType}\n`
                    )
                }
                if (error) {
                    // 消耗响应数据以释放内存
                    res.resume()
                    reject(error)
                }
                res.setEncoding('utf8')
                let rawData = ''
                res.on('data', chunk => {
                    rawData += chunk
                })
                res.on('end', () => {
                    try {
                        let obj = JSON.parse(rawData)
                        // 请求出错了
                        if (obj && obj.message) {
                            reject(new Error(obj.message))
                        }
                        resolve(obj)
                    } catch (e) {
                        reject(e)
                    }
                })
                res.on('error', err => {
                    reject(err)
                })
            })
            .on('error', e => {
                reject(e)
            })
    })
}
/**
 * 获取视频流
 *
 * @param {string} downurl 下载地址
 * @returns
 */
function getVideoStream(downurl) {
    let options = url.parse(downurl)
    // 破解Referer防盗链
    Object.assign(options, {
        headers: {
            Referer: 'https://www.bilibili.com'
        }
    })
    return new Promise((resolve, reject) => {
        http.get(options, res => {
            const { statusCode } = res
            if (statusCode !== 200) {
                reject(new Error('请求失败。\n' + `状态码: ${statusCode}`))
            }
            // 得到视频流
            resolve(res)
        }).on('error', err => {
            reject(err)
        })
    })
}
/**
 * 根据下载链接获取文件名
 *
 * @param {string} fileurl
 * @returns {string} 文件名
 */
function getFilename(fileurl) {
    let endIndex =
        fileurl.indexOf('?') > 0 ? fileurl.indexOf('?') : fileurl.length - 1
    return fileurl.slice(fileurl.lastIndexOf('/'), endIndex)
}
/**
 * 下载带backurl的文件
 *
 * @param {Object} downobj
 * @returns {Promise}
 */
function downLoadByObjWithBackUrl(downobj) {
    // length 为时长ms， size为视频字节数
    let { backup_url, url, order, size, length } = downobj
    let urlArr = [...backup_url, url]
    let filepath = path.resolve(__dirname, './' + getFilename(url))
    let writeStream = fs.createWriteStream(filepath)
    let promiseArr = []
    for (let downurl of urlArr) {
        promiseArr.push(getVideoStream(downurl))
    }
    return new Promise((resolve, reject) => {
        Promise.race(promiseArr).then(res => {
            res.pipe(writeStream)
            let receivedLength = 0
            res.on('data', chunk => {
                receivedLength += chunk.length
                readline.cursorTo(
                    process.stdout,
                    0,
                    process.stdout.rows - Number(order) - 1
                )
                readline.clearLine(process.stdout, 0)
                process.stdout.write(
                    `${order}号分段已接收:${(receivedLength * 100) / size}%`
                )
            })
            writeStream.on('finish', () => {
                resolve({
                    filepath,
                    length
                })
            })
            res.on('error', err => {
                writeStream.close()
                reject(err)
            })
        })
    })
}
/**
 * 解析地址并下载视频的公用接口
 *
 * @param {Object} { videourl, name }
 * @returns {Promise}
 */
function fetchVideoCommon({ videourl, name }) {
    return getRequest(videourl).then(obj => {
        let dobjarr = obj.durl
        let promiseArr = []
        for (const downobj of dobjarr) {
            myConsole.log('\n')
            promiseArr.push(downLoadByObjWithBackUrl(downobj))
        }
        return Promise.all(promiseArr).then(pathArr => {
            // 重置光标位置
            readline.cursorTo(process.stdout, 0, process.stdout.rows - 1)
            myConsole.log('已下载完成全部分段 ヽ(✿ﾟ▽ﾟ)ノ\n')
            if (ffmpegPath && ffprobePath && flvtoolPath) {
                let command = ffmpeg()
                    .setFfmpegPath(ffmpegPath)
                    .setFfprobePath(ffprobePath)
                    .setFlvtoolPath(flvtoolPath)
                for (let { filepath } of pathArr) {
                    command = command.input(filepath)
                }
                return new Promise((resolve, reject) => {
                    command
                        .videoCodec('libx264')
                        .format('mp4')
                        .mergeToFile(
                            path.resolve(__dirname, `./${name}.mp4`),
                            path.resolve(__dirname, './')
                        )
                        .on('start', function(commandLine) {
                            process.stdout.write(
                                '开始转码合并文件\nFfmpeg命令: ' +
                                    commandLine +
                                    '\n'
                            )
                        })
                        .on('codecData', function(data) {
                            process.stdout.write(
                                '输入流信息:' + data.video + '\n'
                            )
                        })
                        .on('progress', function(progress) {
                            readline.clearLine(process.stdout, 0)
                            readline.cursorTo(
                                process.stdout,
                                0,
                                process.stdout.rows - 1
                            )
                            process.stdout.write(
                                '编码合并已完成: ' + progress.percent + '%'
                            )
                        })
                        .on('error', function(err) {
                            reject(err)
                        })
                        .on('end', function() {
                            process.stdout.write('\n合并完成! (๑•̀ㅂ•́)و✧\n')
                            resolve()
                        })
                })
            } else {
                myConsole.log('不进行转码合并\n')
                return
            }
        })
    })
}
/**
 * 请求番剧或电视剧
 *
 * @param {*} [{
 *     cid,
 *     season_type = undefined,
 *     name = 'test'
 * }={}]
 * @returns {Promise}
 */
function fetchBangumiVideos({
    cid,
    season_type = undefined,
    name = 'test'
} = {}) {
    let query = {
        query: getParams({ cid, season_type, moduleType: 'bangumi' })
    }
    let queryObj = {}
    Object.assign(queryObj, bangumiBaseOptions, query)
    let queryStr = url.format(queryObj)
    // myConsole.log(queryStr)
    // 获取地址
    return getRequest(queryStr)
        .then(obj => {
            // 获取最高质量
            let quality = obj.accept_quality.sort((a, b) => b - a)
            if (quality && quality.length > 0) {
                quality = quality[0]
            } else {
                throw new Error('无法获取视频质量信息')
            }
            return quality
        })
        .then(quality => {
            // 最高质量下载
            let hqQuery = {
                query: getParams({
                    cid,
                    season_type,
                    quality,
                    qn: quality,
                    moduleType: 'bangumi'
                })
            }
            let hqQueryObj = {}
            Object.assign(hqQueryObj, bangumiBaseOptions, hqQuery)
            let hqQueryStr = url.format(hqQueryObj)
            // 第二次解析并下载
            return fetchVideoCommon({
                videourl: hqQueryStr,
                name
            })
        })
}
/**
 * 获取普通视频
 *
 * @param {Object} [{ cid, quality, name = 'test' }={}]
 * @returns {Promise}
 */
function fetchOrdinaryVideo({ cid, quality, name = 'test' } = {}) {
    let query = {
        query: getParams({ cid, quality, qn: quality })
    }
    let queryObj = {}
    Object.assign(queryObj, videoBaseOptions, query)
    let queryStr = url.format(queryObj)
    // myConsole.log(queryStr)
    // 获取地址
    return fetchVideoCommon({
        videourl: queryStr,
        name
    })
}
/**
 * 分析网页获取所需参数
 *
 * @param {string} bilibiliurl
 * @returns
 */
function analyzehtml(bilibiliurl) {
    // 番剧：https://www.bilibili.com/bangumi/play/ss23851
    let name = ''
    return JSDOM.fromURL(bilibiliurl, {
        runScripts: 'dangerously'
    })
        .catch(() => {
            myConsole.log(
                '\n(￣ε(#￣)☆╰╮o(￣皿￣///) 解析页面时出了点岔子，正在尽力挽回...\n'
            )
        })
        .then(({ window }) => {
            if (window && window.__INITIAL_STATE__) {
                let cid
                let season_type
                let page = 0
                let pageArr = getUrlParamArr(bilibiliurl, 'p')
                if (pageArr && pageArr.length > 0) {
                    page = pageArr[0] - 1
                }
                if (window.__playinfo__ && window.__INITIAL_STATE__.videoData) {
                    cid = window.__INITIAL_STATE__.videoData.pages[page].cid
                    name = window.__INITIAL_STATE__.videoData.title
                    let quality = window.__playinfo__.accept_quality.sort(
                        (a, b) => b - a
                    )
                    if (quality && quality.length > 0) {
                        quality = quality[0]
                    }
                    myConsole.log('╰(*°▽°*)╯ 检测到普通视频地址!\n')
                    return fetchOrdinaryVideo({ cid, quality, name })
                } else if (
                    window.__INITIAL_STATE__.epInfo &&
                    window.__INITIAL_STATE__.mediaInfo
                ) {
                    // 视频cid
                    cid = window.__INITIAL_STATE__.epInfo.cid
                    // season_type, 1 为动画, 5 为电视剧; 为5/3时, 不是番剧视频
                    season_type = window.__INITIAL_STATE__.mediaInfo.season_type
                    name = `${window.__INITIAL_STATE__.mediaInfo.title}第${
                        window.__INITIAL_STATE__.epInfo.index
                    }集${window.__INITIAL_STATE__.epInfo.index_title}`
                    myConsole.log('╰(*°▽°*)╯ 检测到番剧或电视剧地址!\n')
                    return fetchBangumiVideos({
                        cid,
                        season_type
                    })
                } else {
                    throw new Error('无法正确解析页面!!! w(ﾟДﾟ)w')
                }
            } else {
                throw new Error('分析不到视频信息!!! w(ﾟДﾟ)w')
            }
        })
}
// 执行
getStdin()
