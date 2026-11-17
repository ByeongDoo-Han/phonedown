import { withSupabase } from 'npm:@supabase/server@1';

import { errorResponse, isUuid } from '../_shared/session.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('POST 요청만 지원합니다.', 405);
    const userId = ctx.userClaims?.id;
    if (!userId) return errorResponse('로그인이 필요합니다.', 401);

    let body: { productId?: unknown; phone?: unknown; idempotencyKey?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 형식이 올바르지 않습니다.', 400);
    }
    if (!isUuid(body.productId) || !isUuid(body.idempotencyKey)) {
      return errorResponse('교환 요청 정보가 올바르지 않습니다.', 400);
    }
    if (typeof body.phone !== 'string') return errorResponse('휴대전화 번호를 입력해 주세요.', 400);

    const { data, error } = await ctx.supabaseAdmin.rpc('redeem_product', {
      p_user_id: userId,
      p_product_id: body.productId,
      p_phone: body.phone,
      p_idem: body.idempotencyKey,
    });
    if (error) {
      if (error.message.includes('Insufficient confirmed balance')) {
        return errorResponse('확정 포인트가 부족합니다.', 409);
      }
      if (error.message.includes('Product unavailable') || error.message.includes('Product out of stock')) {
        return errorResponse('상품을 교환할 수 없습니다.', 409);
      }
      if (error.code === '22023') return errorResponse('교환 정보를 확인해 주세요.', 400);
      return errorResponse('교환 신청을 처리하지 못했습니다.', 500);
    }
    if (!data?.id) return errorResponse('교환 신청 결과를 확인하지 못했습니다.', 500);
    return Response.json({ redemption: data });
  }),
};
