// Pure helpers for the referral code and the sponsor challenge copy. No React, no Supabase,
// so tests/referralCode.test.mjs can check them directly.
//
// The code itself is issued by the server (8 uppercase hex characters). The app only tidies
// what the friend typed and builds the message we hand to the share sheet.

export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_PATTERN = /^[0-9A-F]{8}$/;

// 0/O and 1/I never appear in a hex code, so only case, spaces and dashes need cleaning.
export function normalizeReferralCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, REFERRAL_CODE_LENGTH);
}

export function isReferralCode(value: string): boolean {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCode(value));
}

export function referralShareMessage(code: string, points: number): string {
  return `오프라인 타임 같이 할래요?\n친구 초대 코드: ${normalizeReferralCode(code)}\n`
    + `코드를 넣고 3일 연속 기록을 정산하면 우리 둘 다 ${points}P를 받아요.`;
}

export type ReferralFailReason =
  | 'bad_format' | 'unknown_code' | 'own_code' | 'already_invited'
  | 'inviter_not_ready' | 'circular' | 'not_new' | 'unavailable';

const referralFailures: Record<ReferralFailReason, string> = {
  bad_format: '초대 코드는 8자리예요. 코드를 다시 확인해 주세요.',
  unknown_code: '이 코드를 찾지 못했어요. 친구에게 다시 확인해 주세요.',
  own_code: '내 초대 코드는 내가 쓸 수 없어요. 친구에게 공유해 주세요.',
  already_invited: '이미 초대 코드를 사용한 계정이에요. 초대는 계정마다 한 번만 받을 수 있어요.',
  inviter_not_ready: '친구가 아직 시작 전이라 코드를 받을 수 없어요. 조금 뒤에 다시 시도해 주세요.',
  circular: '서로 초대하는 코드는 받을 수 없어요.',
  not_new: '기록이 있는 계정은 초대 코드를 넣을 수 없어요. 친구에게 새 계정으로 시작해 달라고 해주세요.',
  unavailable: '지금은 초대 기능을 쓸 수 없어요. 잠시 뒤에 다시 시도해 주세요.',
};

export function referralFailText(reason: string | undefined): string {
  if (reason && reason in referralFailures) {
    return referralFailures[reason as ReferralFailReason];
  }
  return referralFailures.unavailable;
}

export type SponsorSegment = 'sleep_recovery' | 'focus_growth' | 'both';

export function segmentLabel(segment: SponsorSegment): string {
  if (segment === 'sleep_recovery') return '수면·회복';
  if (segment === 'focus_growth') return '집중·자기개발';
  return '모든 사용자';
}

export type ChallengeStatus = 'joined' | 'completed' | 'abandoned' | 'expired';

// The one line that tells a user what they have to do: mode, minutes, days, window.
export function challengeCondition(input: {
  mode: 'sleep' | 'focus';
  target_days: number;
  min_minutes_per_day: number;
  window_days: number;
  consecutive: boolean;
}): string {
  const hours = input.min_minutes_per_day / 60;
  const perDay = Number.isInteger(hours)
    ? `${hours}시간`
    : `${input.min_minutes_per_day}분`;
  const mode = input.mode === 'sleep' ? '수면' : '집중';
  const join = input.consecutive ? ' 연속' : '';
  return `${input.window_days}일 안에 ${mode} ${perDay} 이상을 ${input.target_days}일${join} 기록`;
}

export function challengeProgressLabel(input: {
  status: ChallengeStatus;
  progress_days: number;
  target_days: number;
  consecutive: boolean;
}): string {
  if (input.status === 'completed') return '달성 · 쿠폰이 발급됐어요';
  if (input.status === 'expired') return '기간이 끝났어요 · 다시 참여할 수 있어요';
  if (input.status === 'abandoned') return '참여를 취소했어요';
  return `${Math.min(input.progress_days, input.target_days)} / ${input.target_days}일 진행`;
}

export function formatKrw(value: number): string {
  if (value <= 0) return '';
  return `${value.toLocaleString('ko-KR')}원 상당`;
}
