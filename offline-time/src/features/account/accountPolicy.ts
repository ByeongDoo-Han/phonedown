// 회원 탈퇴 화면의 판정과 문구.
//
// 애플 심사는 앱 안에서 계정을 지울 수 있는 길을 요구한다. 되돌릴 수 없는 일이므로 확인 단계를
// 두되, "탈퇴"를 입력하게 하는 식으로 무심코 누르지 않게 한다. 실제 삭제는 서버
// (`delete-account` Edge Function)가 하고, 이 파일은 화면 문구만 책임진다.

export const DELETION_CONFIRM_WORD = '탈퇴';

export const DELETION_CONSEQUENCES: string[] = [
  '수면·집중 기록과 포인트가 모두 지워지고 다시 되돌릴 수 없어요.',
  '아직 발송되지 않은 교환 신청은 취소되고, 그 포인트도 함께 사라져요.',
  '친구 초대 진행 상황과 브랜드 쿠폰도 함께 사라져요.',
  '이미 발송된 상품은 탈퇴와 상관없이 그대로 도착해요.',
];

export function canConfirmDeletion(input: string): boolean {
  return input.trim() === DELETION_CONFIRM_WORD;
}

/** 탈퇴 확인 모달에서 발송 대기 중인 교환이 있으면 따로 알린다. */
export function pendingRedemptionWarning(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return `발송 대기 중인 교환이 ${count}건 있어요. 탈퇴하면 취소되고 포인트는 환급되지 않아요.`;
}

export function deletionFailureText(status: number | null): string {
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.';
  if (status === 503) return '탈퇴 처리가 아직 준비되지 않았어요. 잠시 뒤에 다시 시도해 주세요.';
  if (status === 500) return '계정을 지우지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  return '탈퇴를 마치지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
}
