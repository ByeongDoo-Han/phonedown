import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type PrimaryMode = 'sleep' | 'focus' | 'both';
export type Profile = {
  primary_mode: PrimaryMode;
  onboarded_at: string | null;
  sleep_bedtime: string | null;
  sleep_waketime: string | null;
};

const profileColumns = 'primary_mode,onboarded_at,sleep_bedtime,sleep_waketime';
// Until 0007_sleep_mode.sql is applied the goal columns do not exist; the profile still loads
// and the app falls back to the default 23:00–07:00 goal.
const legacyProfileColumns = 'primary_mode,onboarded_at';

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && !!supabase,
    queryFn: async (): Promise<Profile> => {
      if (!supabase || !userId) throw new Error('인증 정보가 없습니다.');
      const read = (select: string) => supabase!.from('users')
        .select(select).eq('id', userId).single();
      let { data, error } = await read(profileColumns);
      if (error?.code === '42703') ({ data, error } = await read(legacyProfileColumns));
      if (error) throw error;
      const row = data as Partial<Profile>;
      return {
        primary_mode: row.primary_mode ?? 'both',
        onboarded_at: row.onboarded_at ?? null,
        sleep_bedtime: row.sleep_bedtime ?? null,
        sleep_waketime: row.sleep_waketime ?? null,
      };
    },
  });
}

export async function saveSleepGoal(userId: string,
  bedtime: string, waketime: string): Promise<Profile> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('users')
    .update({ sleep_bedtime: bedtime, sleep_waketime: waketime })
    .eq('id', userId).select(profileColumns).single();
  if (error) throw error;
  return data as Profile;
}
