const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withJetifier(config) {
  return withGradleProperties(config, (config) => {
    // Le indicamos a Android que active la traducción de dependencias antiguas
    config.modResults.push({
      type: 'property',
      key: 'android.enableJetifier',
      value: 'true',
    });
    return config;
  });
};