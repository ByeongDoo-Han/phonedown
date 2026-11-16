# 오프라인 타임

Expo SDK 58 모바일 앱과 Supabase 데이터베이스의 초기 구현입니다. 현재 M0 범위는 가입, 로그인, 주력 시간 선택, 홈 진입입니다. 세션 적립, 정산, 교환은 아직 동작하지 않습니다.

연결된 원격 `apptech` 프로젝트(`uhisjleftevizjfudeip`)는 PostgreSQL 17.11입니다. 초기 기획의 PostgreSQL 15 고정 조건은 2026-11-16 사용자 선택에 따라 이 프로젝트에서 PostgreSQL 17로 변경했습니다. `0001_init.sql`과 앱 복귀 URL 설정은 원격에 적용됐습니다.

## 로컬 실행

Node 22와 pnpm이 필요합니다.

```sh
pnpm install
npx supabase start
npx supabase db reset
```

`npx supabase status`에서 나온 API URL과 anon/publishable key를 `.env.example`을 복사한 `.env`에 넣습니다. Android 에뮬레이터에서는 로컬 API 호스트를 `10.0.2.2`로 바꿔야 합니다. 실제 기기에서는 개발 PC의 LAN 주소를 사용합니다.

```sh
pnpm start
```

이메일 인증은 로컬 Supabase에서 즉시 가입되도록 설정되어 있습니다. 원격 `apptech` 프로젝트는 이메일 확인이 켜져 있어 가입 후 메일 링크를 열어야 합니다.

## 원격 인증 설정

원격 Supabase 프로젝트와 앱 환경 변수는 연결됐습니다. 실제 소셜 로그인을 위해 다음 제공자 설정이 남았습니다.

- Auth Redirect URL `offlinetime://auth/callback`과 개발 웹 URL은 등록됐습니다.
- Apple provider에는 앱 ID `app.offlinetime.mobile`을 등록하고 Apple Developer의 Sign in with Apple 기능을 켭니다. iOS 앱은 네이티브 Apple 로그인을 사용합니다.
- Google provider에는 Google Cloud에서 만든 OAuth client ID와 secret을 등록합니다.
- Android의 Apple 로그인까지 제공하려면 Apple Services ID와 비밀 키도 필요합니다.

서비스 역할 키와 OAuth 비밀 키는 앱 환경 변수에 넣지 않습니다. 앱에는 publishable key만 사용합니다.

`supabase/config.toml`에는 로컬 개발용 Auth 기본값도 들어 있습니다. 전체 파일을 `supabase config push`로 원격에 적용하면 이메일 확인 같은 원격 설정이 바뀔 수 있으므로, 원격 설정은 변경할 항목만 지정해 적용합니다.

## 확인

```sh
npx tsc --noEmit
npx expo lint
```

기획 원문은 [spec.md](docs/spec.md)에 있습니다. 정책 수치와 적립 로직은 후속 마일스톤에서 서버 함수와 함께 구현합니다.
