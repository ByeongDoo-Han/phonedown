import { withSupabase } from 'npm:@supabase/server@1';

import { actorLabel, checkAdmin } from '../_shared/admin.ts';
import {
  missingKeys,
  readProviderConfig,
  sendFulfillment,
  type FulfillmentKind,
  type FulfillmentOrder,
} from '../_shared/giftCoupon.ts';
import { errorResponse, isUuid } from '../_shared/session.ts';

// 운영자 발송 도구. 앱의 관리자 화면이 운영자 세션으로 부르고, 함수는 service_role로 DB를 쓴다.
// 포인트를 만드는 경로는 여전히 서버뿐이다: 발송 완료/실패는 0009의 RPC를 통과하고, 그 RPC가
// 다시 0004의 resolve_redemption을 부른다.
//
//   whoami  — 이 사람이 운영자인지(관리자 화면 진입 확인)
//   list    — 대기 중인 교환·쿠폰
//   send    — 공급자에게 발송 시도. manual 모드면 "직접 보내고 완료 처리"를 안내
//   fulfill — 발송 완료 처리(거래 번호·메모)
//   fail    — 발송 실패 처리(교환은 환급·재고 복원까지)

type Body = {
  action?: unknown;
  kind?: unknown;
  id?: unknown;
  reason?: unknown;
  externalId?: unknown;
  memo?: unknown;
  limit?: unknown;
  includeResolved?: unknown;
};

const MAX_TEXT = 300;

function text(value: unknown, limit = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, limit);
}

function kindOf(value: unknown): FulfillmentKind | null {
  return value === 'redemption' || value === 'coupon' ? value : null;
}

function rpcError(message: string): Response {
  if (message.includes('not found')) return errorResponse('대상을 찾지 못했습니다.', 404);
  if (message.includes('already being processed')) {
    return errorResponse('다른 운영자가 발송 중입니다. 15분 뒤에 다시 시도해 주세요.', 409);
  }
  if (message.includes('already refunded') || message.includes('cannot be refunded')) {
    return errorResponse('이미 환급된 신청입니다. 발송 완료로 바꿀 수 없어요.', 409);
  }
  if (message.includes('required') || message.includes('Unknown fulfillment kind')) {
    return errorResponse('요청 값이 올바르지 않습니다.', 400);
  }
  return errorResponse('발송 처리를 마치지 못했습니다.', 500);
}

async function loadOrder(
  admin: { from: (table: string) => unknown },
  kind: FulfillmentKind,
  id: string,
): Promise<{ order: FulfillmentOrder } | { response: Response }> {
  // supabase-js의 체이닝 타입을 그대로 쓰면 함수 안에서 너무 길어져, 필요한 열만 읽는 헬퍼로 감싼다.
  const client = admin as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };

  if (kind === 'redemption') {
    const { data, error } = await client.from('redemptions')
      .select('id,points,phone,products(name,type)')
      .eq('id', id).single();
    if (error || !data) return { response: errorResponse('교환 신청을 찾지 못했습니다.', 404) };
    const product = data.products as { name?: string; type?: string } | null;
    return {
      order: {
        kind,
        targetId: id,
        productName: product?.name ?? '교환 상품',
        rewardTitle: product?.name ?? '교환 상품',
        points: typeof data.points === 'number' ? data.points : 0,
        phone: typeof data.phone === 'string' ? data.phone : null,
        memo: null,
      },
    };
  }

  const { data, error } = await client.from('sponsor_coupons')
    .select('id,code,reward_title,value_krw')
    .eq('id', id).single();
  if (error || !data) return { response: errorResponse('쿠폰을 찾지 못했습니다.', 404) };
  return {
    order: {
      kind,
      targetId: id,
      productName: typeof data.reward_title === 'string' ? data.reward_title : '브랜드 쿠폰',
      rewardTitle: typeof data.reward_title === 'string' ? data.reward_title : '브랜드 쿠폰',
      points: 0,
      phone: null,
      memo: typeof data.code === 'string' ? data.code : null,
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('POST 요청만 지원합니다.', 405);
    const userId = ctx.userClaims?.id;
    const access = checkAdmin(userId);
    if (!access.ok) return errorResponse(access.message, access.status);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 형식이 올바르지 않습니다.', 400);
    }
    const action = typeof body.action === 'string' ? body.action : '';
    const admin = ctx.supabaseAdmin;
    const actor = actorLabel(userId);
    const config = readProviderConfig((key) => Deno.env.get(key));
    const missing = missingKeys(config);

    if (action === 'whoami') {
      return Response.json({ admin: true, mode: config.provider, missing });
    }
    if (missing.length > 0) {
      return errorResponse(`발송 공급자 설정이 비어 있습니다: ${missing.join(', ')}`, 503);
    }

    if (action === 'list') {
      const limit = typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.round(body.limit) : 50;
      const { data, error } = await admin.rpc('pending_fulfillment', {
        p_limit: limit,
        p_include_resolved: body.includeResolved === true,
      });
      if (error) {
        console.error('pending_fulfillment failed:', error.code, error.message);
        return errorResponse('대기 목록을 불러오지 못했습니다.', 500);
      }
      return Response.json({ mode: config.provider, ...(data as Record<string, unknown>) });
    }

    const kind = kindOf(body.kind);
    const id = body.id;
    if (!kind || !isUuid(id)) return errorResponse('대상 정보가 올바르지 않습니다.', 400);

    if (action === 'send') {
      // 1) 발송을 잡는다(중복 발송 방지 15분 락, 시도 횟수 +1).
      const begin = kind === 'redemption'
        ? await admin.rpc('begin_redemption', {
          p_redemption_id: id, p_provider: config.provider, p_actor: actor,
        })
        : await admin.rpc('begin_sponsor_coupon', {
          p_coupon_id: id, p_provider: config.provider, p_actor: actor,
        });
      if (begin.error) return rpcError(begin.error.message);

      if (config.provider === 'manual') {
        // 자동 발송 수단이 없다. 운영자가 직접 보낸 뒤 fulfill로 결과를 남긴다.
        return Response.json({
          mode: 'manual',
          item: begin.data,
          instruction: '자동 발송이 설정되지 않았어요. 직접 발송한 뒤 거래 번호를 남기고 완료 처리해 주세요.',
        });
      }

      const loaded = await loadOrder(admin, kind, id);
      if ('response' in loaded) return loaded.response;

      const outcome = await sendFulfillment(loaded.order, config);
      if (!outcome.ok) {
        await admin.rpc('record_fulfillment_error', {
          p_kind: kind,
          p_target_id: id,
          p_error: outcome.error,
          p_provider: outcome.provider,
          p_actor: actor,
        });
        return errorResponse(outcome.error, outcome.retryable ? 502 : 422);
      }

      const done = kind === 'redemption'
        ? await admin.rpc('fulfill_redemption', {
          p_redemption_id: id,
          p_provider: outcome.provider,
          p_external_id: outcome.externalId,
          p_memo: '자동 발송',
          p_actor: actor,
        })
        : await admin.rpc('resolve_sponsor_coupon', {
          p_coupon_id: id,
          p_sent: true,
          p_fail_reason: null,
          p_provider: outcome.provider,
          p_external_id: outcome.externalId,
          p_actor: actor,
        });
      if (done.error) return rpcError(done.error.message);
      return Response.json({ mode: outcome.provider, item: done.data, message: outcome.message });
    }

    if (action === 'fulfill') {
      const externalId = text(body.externalId, 100);
      const memo = text(body.memo, MAX_TEXT);
      const done = kind === 'redemption'
        ? await admin.rpc('fulfill_redemption', {
          p_redemption_id: id,
          p_provider: config.provider,
          p_external_id: externalId,
          p_memo: memo,
          p_actor: actor,
        })
        : await admin.rpc('resolve_sponsor_coupon', {
          p_coupon_id: id,
          p_sent: true,
          p_fail_reason: null,
          p_provider: config.provider,
          p_external_id: externalId,
          p_actor: actor,
        });
      if (done.error) return rpcError(done.error.message);
      return Response.json({ mode: config.provider, item: done.data });
    }

    if (action === 'fail') {
      const reason = text(body.reason, MAX_TEXT);
      if (!reason) return errorResponse('실패 사유를 적어 주세요.', 400);
      const done = kind === 'redemption'
        ? await admin.rpc('fail_redemption', {
          p_redemption_id: id, p_reason: reason, p_provider: config.provider, p_actor: actor,
        })
        : await admin.rpc('resolve_sponsor_coupon', {
          p_coupon_id: id,
          p_sent: false,
          p_fail_reason: reason,
          p_provider: config.provider,
          p_external_id: null,
          p_actor: actor,
        });
      if (done.error) return rpcError(done.error.message);
      return Response.json({ mode: config.provider, item: done.data });
    }

    return errorResponse('지원하지 않는 동작입니다.', 400);
  }),
};
