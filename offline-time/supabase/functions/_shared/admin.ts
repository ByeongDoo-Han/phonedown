// Operator access for the fulfillment tools.
//
// The admin screen in the app calls `admin-fulfillment` with the operator's own Supabase session,
// so the function knows who is asking. Access is a list of user ids in the `ADMIN_USER_IDS`
// secret (comma or whitespace separated). Until that secret is set nobody is an operator: the
// function answers 503 with the exact thing to configure instead of falling open. There is no
// shared password — the caller must already be signed in, and a leaked UI is harmless because
// every action re-checks this list.

export type AdminDecision =
  | { ok: true }
  | { ok: false; status: number; message: string };

// Deno가 없는 곳(node --test)에서도 이 파일을 그대로 불러 검사할 수 있게 기본값을 지연 평가한다.
function adminEnv(): string | undefined {
  return typeof Deno === 'undefined' ? undefined : Deno.env.get('ADMIN_USER_IDS');
}

export function configuredAdminIds(raw: string | undefined = adminEnv()): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

export function checkAdmin(userId: string | undefined,
  raw: string | undefined = adminEnv()): AdminDecision {
  const admins = configuredAdminIds(raw);
  if (admins.length === 0) {
    return {
      ok: false,
      status: 503,
      message: '운영자 기능이 아직 설정되지 않았습니다. Supabase secrets에 ADMIN_USER_IDS를 등록해 주세요.',
    };
  }
  if (!userId) return { ok: false, status: 401, message: '로그인이 필요합니다.' };
  if (!admins.includes(userId.trim().toLowerCase())) {
    return { ok: false, status: 403, message: '운영자 권한이 없습니다.' };
  }
  return { ok: true };
}

// The audit trail records who pressed the button. The user id is enough; it is not shown to the
// customer and keeps the log free of names and emails.
export function actorLabel(userId: string | undefined): string | null {
  return userId ?? null;
}
