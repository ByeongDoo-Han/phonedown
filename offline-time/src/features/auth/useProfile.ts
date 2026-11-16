import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type PrimaryMode = 'sleep' | 'focus' | 'both';
export type Profile = { primary_mode: PrimaryMode; onboarded_at: string | null };

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && !!supabase,
    queryFn: async (): Promise<Profile> => {
      if (!supabase || !userId) throw new Error('인증 정보가 없습니다.');
      const { data, error } = await supabase.from('users')
        .select('primary_mode,onboarded_at').eq('id', userId).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}
