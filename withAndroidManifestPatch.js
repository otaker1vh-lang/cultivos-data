const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidManifestPatch(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const app = androidManifest.manifest.application[0];

    // Asegurar que el namespace de 'tools' esté definido
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Añadir la regla de reemplazo para el appComponentFactory
    if (app.$['tools:replace']) {
      if (!app.$['tools:replace'].includes('android:appComponentFactory')) {
        app.$['tools:replace'] += ',android:appComponentFactory';
      }
    } else {
      app.$['tools:replace'] = 'android:appComponentFactory';
    }

    return config;
  });
};