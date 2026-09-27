import type { ConfigContext, ExpoConfig } from 'expo/config';

const isDevelopmentBuild = process.env.APP_VARIANT === 'development';
const developmentPlugins: NonNullable<ExpoConfig['plugins']> = [
  ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
];

export default ({ config }: ConfigContext): ExpoConfig => {
  // Expo supplies the normalized static config at runtime; its context type
  // marks fields optional, so narrow it to the documented output type here.
  const normalizedConfig = config as ExpoConfig;

  return {
    ...normalizedConfig,
    plugins: [
      ...(normalizedConfig.plugins ?? []),
      ...(isDevelopmentBuild ? developmentPlugins : []),
    ],
  };
};
