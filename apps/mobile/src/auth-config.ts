const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!publishableKey) {
  throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be configured.');
}

if (!apiBaseUrl || !/^https?:\/\/[^/]+$/u.test(apiBaseUrl)) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute API origin.');
}

export const clerkPublishableKey = publishableKey;
export const apiOrigin = apiBaseUrl;
