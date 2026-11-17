import { withSupabase } from 'npm:@supabase/server@1';

import { parseAdCustomData } from '../_shared/adReward.ts';
import { errorResponse, isUuid } from '../_shared/session.ts';
import { verifyAdMobSsv } from '../_shared/ssv.ts';

// AdMob calls this URL directly (no Supabase credentials). The reward is granted only
// when the callback carries a signature made with an AdMob verifier key.
function accepted(body: Record<string, unknown>) {
  return Response.json({ ok: true, ...body });
}

function settle(data: unknown, error: { message?: string; code?: string } | null,
  placement: string) {
  if (!error) return accepted({ placement, result: data });
  if (error.message?.includes('not recorded yet')) {
    // Base points may still be landing; let AdMob retry this callback.
    console.error('AdMob SSV will retry:', placement, error.message);
    return errorResponse('광고 보상을 아직 확정하지 못했습니다.', 500);
  }
  // A rejected claim must not be retried forever: AdMob stops after a few attempts anyway.
  console.warn('AdMob SSV claim rejected:', placement, error.code, error.message);
  return accepted({ placement, ignored: error.message ?? 'rejected' });
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'GET') return errorResponse('GET 요청만 지원합니다.', 405);

    const url = new URL(req.url);
    const verification = await verifyAdMobSsv(url);
    if (!verification.ok) {
      console.error('AdMob SSV rejected:', verification.reason);
      return errorResponse('광고 검증에 실패했습니다.', 403);
    }

    const params = verification.params;
    const userId = params.get('user_id');
    const transactionId = params.get('transaction_id');
    const adUnit = params.get('ad_unit');
    if (!isUuid(userId) || !transactionId || transactionId.length > 200) {
      console.warn('AdMob SSV without a usable user or transaction id');
      return accepted({ ignored: 'missing_identity' });
    }

    const custom = parseAdCustomData(params.get('custom_data'));
    if (!custom) {
      console.warn('AdMob SSV without placement custom data');
      return accepted({ ignored: 'missing_placement' });
    }

    if (custom.kind === 'settlement_booster') {
      if (!isUuid(custom.session_id)) return accepted({ ignored: 'bad_session' });
      const { data, error } = await ctx.supabaseAdmin.rpc('claim_ad_booster', {
        p_user_id: userId,
        p_session_id: custom.session_id,
        p_ssv_transaction_id: transactionId,
        p_ad_unit: adUnit,
      });
      return settle(data, error, 'settlement_booster');
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('claim_weekly_box', {
      p_user_id: userId,
      p_ssv_transaction_id: transactionId,
      p_ad_unit: adUnit,
    });
    return settle(data, error, 'weekly_box');
  }),
};
