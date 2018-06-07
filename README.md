![bilibili](http://img5.duitang.com/uploads/blog/201602/21/20160221161429_XTRd5.thumb.700_0.jpeg)

## bilibili 下载器

### 主体下载逻辑基于 nodejs，支持 nodejs 支持的所有平台使用

### 编码合并功能依赖于 ffmpeg

## 依赖

- [nodejs](https://nodejs.org/en/)

- [ffmpeg](http://ffmpeg.org/download.html)(可选)

## 使用方法

推荐直接使用 Release 中的脚本即可

- 仅下载视频分段：

```cmd
node bilibilidownload.js
```

- 下载分段并合并为 mp4 文件(需要本地安装 ffmpeg)

```
node bilibilidownload.js YourffmpegPath YourffprobePath YourflvtoolPath
```

后面的 3 个参数为本地 ffmpeg 的路径,ffprobe 路径，flvtool 的路径

## 协助开发指南

- build 文件夹下为 webpack 配置文件

- src 下 index.js 为源码,config.js 为配置文件

## 现阶段问题

### ~~由于 bilibili 视频采取了分段,限于编解码的问题，对于分段视频仅能分段下载~~

通过 ffmpeg 已实现合并文件功能，但编码合并时 cpu 占用率很高 Σ( ° △ °|||)︴
