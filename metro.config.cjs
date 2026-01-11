const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agregamos las extensiones necesarias para tu IA
config.resolver.assetExts.push('tflite');
config.resolver.assetExts.push('txt');

module.exports = config;