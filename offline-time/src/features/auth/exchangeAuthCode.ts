import { supabase } from '@/lib/supabase';

let lastCode: string | undefined;
let lastExchange: Promise<void> | undefined;

export function exchangeAuthCode(code: string): Promise<void> {
  if (!supabase) return Promise.reject(new Error('Supabase 연결 설정이 필요합니다.'));
  if (code === lastCode && lastExchange) return lastExchange;

  lastCode = code;
  lastExchange = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
    if (error) throw error;
  });
  return lastExchange;
}
