const path = require('path')
const webpack = require('webpack')

module.exports = {
    entry: {
        bilibilidownload: './src/index.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, '../dist')
    },
    target: 'node',
    node: {
        __dirname: false
    },
    mode: 'production',
    module: {
        rules: [
            { test: /\.js$/, exclude: /node_modules/, loader: 'babel-loader' }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                FLUENTFFMPEG_COV: false
            }
        })
    ]
}
