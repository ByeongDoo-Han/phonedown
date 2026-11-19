import assert from 'node:assert/strict';
import test from 'node:test';

import defaultConfig, { ADMOB_TEST_APP_ID, admobReleaseBlocker, buildConfig, resolveAdMobAppId }
  from '../app.config.ts';

// app.json의 최소 골격. plugins 배열에 AdMob 항목이 있는지가 이 테스트의 관심사다.
const baseConfig = {
  name: '오프라인 타임',
  slug: 'offline-time',
  plugins: [
    'expo-router',
    ['react-native-google-mobile-ads', { iosAppId: ADMOB_TEST_APP_ID.ios, delayAppMeasurementInit: true }],
  ],
  extra: { eas: { projectId: 'test-project' } },
};

test('an app id from the environment replaces the test id', () => {
  assert.deepEqual(resolveAdMobAppId('ios', 'ca-app-pub-1~2'), { appId: 'ca-app-pub-1~2', test: false });
  assert.deepEqual(resolveAdMobAppId('ios', '  '), { appId: ADMOB_TEST_APP_ID.ios, test: true });
  assert.deepEqual(resolveAdMobAppId('android', undefined), { appId: ADMOB_TEST_APP_ID.android, test: true });
});

test('development builds keep the test ids and say so', () => {
  const config = buildConfig(baseConfig, {});
  const plugin = config.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'react-native-google-mobile-ads');
  assert.equal(plugin[1].iosAppId, ADMOB_TEST_APP_ID.ios);
  assert.equal(plugin[1].androidAppId, ADMOB_TEST_APP_ID.android);
  // 다른 옵션은 그대로 둔다.
  assert.equal(plugin[1].delayAppMeasurementInit, true);
  assert.equal(config.extra.admobTestAppIds, true);
  assert.deepEqual(config.extra.eas, { projectId: 'test-project' });
  assert.equal(config.plugins[0], 'expo-router');
});

test('production builds take the real ids from the environment', () => {
  const config = buildConfig(baseConfig, {
    EAS_BUILD_PROFILE: 'production',
    ADMOB_APP_ID_IOS: 'ca-app-pub-999~1',
    ADMOB_APP_ID_ANDROID: 'ca-app-pub-999~2',
  });
  const plugin = config.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'react-native-google-mobile-ads');
  assert.equal(plugin[1].iosAppId, 'ca-app-pub-999~1');
  assert.equal(plugin[1].androidAppId, 'ca-app-pub-999~2');
  assert.equal(config.extra.admobTestAppIds, false);
});

test('the default export reads the running process environment', () => {
  const config = defaultConfig({ config: baseConfig, projectRoot: process.cwd(), staticConfigPath: null,
    packageJsonPath: null });
  assert.equal(config.slug, 'offline-time');
  assert.equal(config.extra.admobTestAppIds, true);
});

test('a production build with a test app id stops before it ships', () => {
  const blocker = admobReleaseBlocker({
    profile: 'production',
    ios: resolveAdMobAppId('ios', undefined),
    android: resolveAdMobAppId('android', 'ca-app-pub-999~2'),
  });
  assert.match(blocker, /ADMOB_APP_ID_IOS/);
  assert.doesNotMatch(blocker, /ADMOB_APP_ID_ANDROID/);
  assert.throws(() => buildConfig(baseConfig, { EAS_BUILD_PROFILE: 'production' }),
    /ADMOB_APP_ID_IOS/);
  // preview·development는 그대로 테스트 ID로 빌드한다.
  assert.equal(admobReleaseBlocker({
    profile: 'preview',
    ios: resolveAdMobAppId('ios', undefined),
    android: resolveAdMobAppId('android', undefined),
  }), null);
});
