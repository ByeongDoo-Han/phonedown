// Edge Function 호출이 실패했을 때 서버가 보낸 한국어 문구와 상태 코드를 꺼낸다.
//
// supabase-js는 2xx가 아닌 응답을 `FunctionsHttpError`로 감싸고, 그 안의 `context`가 원래
// Response다. 화면은 `error.message`("Edge Function returned a non-2xx status code") 대신
// 서버가 적어 준 이유를 보여 줘야 한다.

export type FunctionFailure = {
  /** 서버가 돌려준 문구. 없으면 빈 문자열. */
  message: string;
  status: number | null;
};

export async function describeFunctionError(error: unknown): Promise<FunctionFailure> {
  const context = (error as { context?: unknown } | null | undefined)?.context;
  if (!(context instanceof Response)) {
    const message = error instanceof Error ? error.message : '';
    return { message, status: null };
  }
  const status = context.status;
  try {
    const payload = await context.clone().json() as { error?: unknown } | null;
    if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
      return { message: payload.error, status };
    }
  } catch {
    // JSON이 아닌 응답(프록시 오류 페이지 등)은 상태 코드만 남긴다.
  }
  return { message: '', status };
}
