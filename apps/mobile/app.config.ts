import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

const isDevelopmentBuild = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  ...appJson.expo,
  plugins: [
    ...(appJson.expo.plugins ?? []),
    ...(isDevelopmentBuild
      ? [
          [
            'expo-build-properties',
            { android: { usesCleartextTraffic: true } },
          ],
        ]
      : []),
  ],
};

export default config;
