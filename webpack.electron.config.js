const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

// Renderer process config
const rendererConfig = {
  mode: 'production',
  target: 'electron-renderer',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public', to: '.', noErrorOnMissing: true },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env.IS_ELECTRON': JSON.stringify(true),
    }),
  ],
};

// Main process config
const mainConfig = {
  mode: 'production',
  target: 'electron-main',
  entry: './electron/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist/electron'),
    filename: 'main.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};

// Preload script config
const preloadConfig = {
  mode: 'production',
  target: 'electron-preload',
  entry: './electron/preload.ts',
  output: {
    path: path.resolve(__dirname, 'dist/electron'),
    filename: 'preload.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
};

module.exports = [rendererConfig, mainConfig, preloadConfig];
