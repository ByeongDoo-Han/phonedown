// 리워드 광고 단위 해석. 앱은 이 파일을 통해서만 광고 단위를 정한다.
//
// 실제 광고 단위 ID는 `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS` / `..._ANDROID`에서 온다.
// 비어 있으면 Google이 공개한 테스트 광고 단위로 떨어져 개발 빌드가 정책 위반(무효 트래픽)을
// 만들지 않는다. 대신 `test: true`로 알려 주어 개발 중임을 화면·로그에서 구분할 수 있게 한다.
//
// 앱 ID(app.json/`app.config.ts`)와 광고 단위는 서로 다른 값이다 — 둘 다 실제 값으로 바꿔야
// 수익이 잡힌다.

export type UnitResolution = {
  unitId: string;
  /** Google 테스트 광고 단위로 떨어졌다. */
  test: boolean;
};

export function resolveRewardedUnit(configured: string | undefined, testUnit: string): UnitResolution {
  const trimmed = configured?.trim();
  if (trimmed && trimmed.length > 0) return { unitId: trimmed, test: false };
  return { unitId: testUnit, test: true };
}

/**
 * 테스트 광고 단위를 쓰는 채로 배포하면 광고 수익이 0이 된다. 개발 중에는 조용히, 배포
 * 빌드(`__DEV__ === false`)에서는 한 번 경고를 남겨 로그에서 알아챌 수 있게 한다.
 */
export function testUnitWarning(input: { test: boolean; isDev: boolean }): string | null {
  if (!input.test || input.isDev) return null;
  return 'AdMob 테스트 광고 단위로 동작 중입니다. EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS/ANDROID를 설정해 주세요.';
}
