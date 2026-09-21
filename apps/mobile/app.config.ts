import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

const isDevelopmentBuild = process.env.APP_VARIANT === 'development';
const baseConfig = appJson.expo as ExpoConfig;
const plugins = baseConfig.plugins ?? [];
const developmentPlugins: NonNullable<ExpoConfig['plugins']> = [
  ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
];

const config: ExpoConfig = {
  ...baseConfig,
  plugins: [...plugins, ...(isDevelopmentBuild ? developmentPlugins : [])],
};

export default config;
