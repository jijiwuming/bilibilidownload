import { appkey, secretkey } from './config'
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
// const ffmpeg = require('fluent-ffmpeg')
// ffmpeg对象
// const command = ffmpeg()
const myConsole = new Console(process.stdout, process.stderr)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})
// 循环获取输入
function getStdin() {
    rl.question('请输入b站视频地址:', userstdin => {
        rl.pause()
        if (userstdin) {
            analyzehtml(userstdin)
        }
        // 再恢复输入接收状态
        rl.resume()
        getStdin()
    })
}
// 核心的请求地址
// 类似https://bangumi.bilibili.com/player/web_api/v2/playurl?
// cid=35943166&appkey=84956560bc028eb7&otype=json&type=&quality=32&module=bangumi&season_type=1&qn=32&sign=43dbf0d2c033f681f8ad49f47baae92f
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
 * 通过cid获取参数
 *
 * @param {string} cid
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
 * @param {RegExp} regex 请求类型的正则表达式
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
                        if (obj && obj.message){
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
 * 下载带backurl的文件
 *
 * @param {Object} obj
 */
function downLoadByObjWithBackUrl(obj) {
    // length 为时长ms， size为视频字节数
    let { backup_url, url, order, size, length } = obj
    let urlArr = [...backup_url, url]
    let filepath = path.resolve(__dirname, '../download/' + getFilename(url))
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
                let str = `${order}号流已接收:${(receivedLength * 100) / size}%`
            })
            writeStream.on('finish', () => {
                resolve({
                    filepath,
                    writeStream,
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
// 获取文件名
function getFilename(fileurl) {
    return fileurl.slice(fileurl.lastIndexOf('/'), fileurl.indexOf('?'))
}
// 请求番剧或电视剧
function fetchBangumiVideos({ cid, season_type = undefined } = {}) {
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
            return getRequest(hqQueryStr).then(obj => {
                let dobjarr = obj.durl
                let promiseArr = []
                for (const downobj of dobjarr) {
                    promiseArr.push(downLoadByObjWithBackUrl(downobj))
                }
                return Promise.all(promiseArr).then(() => {
                    myConsole.log('all done!')
                })
            })
        })
}
// 获取普通视频
function fetchOrdinaryVideo({ cid, quality } = {}) {
    let query = {
        query: getParams({ cid, quality, qn: quality })
    }
    let queryObj = {}
    Object.assign(queryObj, videoBaseOptions, query)
    let queryStr = url.format(queryObj)
    // myConsole.log(queryStr)
    // 获取地址
    return getRequest(queryStr).then(obj => {
        let dobjarr = obj.durl
        let promiseArr = []
        for (const downobj of dobjarr) {
            promiseArr.push(downLoadByObjWithBackUrl(downobj))
        }
        return Promise.all(promiseArr).then(() => {
            myConsole.log('all done!')
        })
    })
}
// 分析地址获取cid
function analyzehtml(bilibiliurl) {
    // 番剧：https://www.bilibili.com/bangumi/play/ss23851
    JSDOM.fromURL(bilibiliurl, {
        runScripts: 'dangerously'
    }).then(({ window }) => {
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
                let quality = window.__playinfo__.accept_quality.sort(
                    (a, b) => b - a
                )
                if (quality && quality.length > 0) {
                    quality = quality[0]
                }
                myConsole.log('检测到普通视频地址!\n')
                return fetchOrdinaryVideo({ cid, quality })
            } else if (
                window.__INITIAL_STATE__.epInfo &&
                window.__INITIAL_STATE__.mediaInfo
            ) {
                // 视频cid
                cid = window.__INITIAL_STATE__.epInfo.cid
                // season_type, 1 为动画, 5 为电视剧; 为5/3时, 不是番剧视频
                season_type = window.__INITIAL_STATE__.mediaInfo.season_type
                myConsole.log('检测到番剧或电视剧地址!\n')
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
