import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json은 그대로 두고, 빌드 환경에서만 달라져야 하는 값을 여기서 덮어쓴다:
//   * AdMob 앱 ID — `ADMOB_APP_ID_IOS` / `ADMOB_APP_ID_ANDROID`
//   * production 빌드에 테스트 앱 ID가 남아 있으면 빌드를 시작하지 않는다.
// 광고 단위(리워드)는 런타임 값(`EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_*`)이라 여기서 다루지 않는다.
//
// 이 파일은 Expo가 JS로 변환해 require하므로 상대 경로 import를 두지 않는다(해석되지 않는다).
// 그래서 아래 해석 규칙은 이 파일 안에 있고, `tests/admobConfig.test.mjs`가 이 파일을 그대로
// 불러 검사한다.

/** Google이 공개한 테스트 앱 ID. app.json의 현재 값과 같다. */
export const ADMOB_TEST_APP_ID = {
  ios: 'ca-app-pub-3940256099942544~1458002511',
  android: 'ca-app-pub-3940256099942544~3347511713',
} as const;

export type AdMobPlatform = keyof typeof ADMOB_TEST_APP_ID;

export type AppIdResolution = {
  appId: string;
  /** 아직 테스트 앱 ID를 쓰고 있다. */
  test: boolean;
};

export function resolveAdMobAppId(platform: AdMobPlatform, configured: string | undefined): AppIdResolution {
  const trimmed = configured?.trim();
  if (trimmed && trimmed.length > 0) return { appId: trimmed, test: false };
  return { appId: ADMOB_TEST_APP_ID[platform], test: true };
}

/** production 빌드인데 테스트 ID가 남아 있으면 그대로 두지 않는다. 사람이 읽을 문장을 돌려준다. */
export function admobReleaseBlocker(input: {
  profile: string;
  ios: AppIdResolution;
  android: AppIdResolution;
}): string | null {
  if (input.profile !== 'production') return null;
  const missing: string[] = [];
  if (input.ios.test) missing.push('ADMOB_APP_ID_IOS');
  if (input.android.test) missing.push('ADMOB_APP_ID_ANDROID');
  if (missing.length === 0) return null;
  return `production 빌드에 AdMob 테스트 앱 ID가 남아 있습니다. ${missing.join(', ')}를 실제 앱 ID로 설정해 주세요.`;
}

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];

function isAdMobPlugin(entry: PluginEntry): entry is [string, Record<string, unknown>] {
  return Array.isArray(entry) && entry[0] === 'react-native-google-mobile-ads';
}

export function buildConfig(config: ExpoConfig, env: Record<string, string | undefined>): ExpoConfig {
  const profile = (env.EAS_BUILD_PROFILE ?? '').trim().toLowerCase();
  const ios = resolveAdMobAppId('ios', env.ADMOB_APP_ID_IOS);
  const android = resolveAdMobAppId('android', env.ADMOB_APP_ID_ANDROID);

  const blocker = admobReleaseBlocker({ profile, ios, android });
  if (blocker) throw new Error(blocker);

  const plugins: PluginEntry[] = (config.plugins ?? []).map((entry) => {
    if (!isAdMobPlugin(entry)) return entry;
    return [entry[0], {
      ...entry[1],
      iosAppId: ios.appId,
      androidAppId: android.appId,
    }];
  });

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      // 개발 빌드가 테스트 광고를 쓰고 있는지 화면·로그에서 알아볼 수 있게 남긴다.
      admobTestAppIds: ios.test || android.test,
    },
  };
}

// Expo는 정적 app.json을 Partial<ExpoConfig>로 넘긴다. 필수 값(name·slug)은 app.json이 채운다.
export default ({ config }: ConfigContext): ExpoConfig => buildConfig(config as ExpoConfig, process.env);
