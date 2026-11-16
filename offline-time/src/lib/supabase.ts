import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const storage = Platform.OS === 'web'
  ? AsyncStorage
  : {
      getItem: (storageKey: string) => SecureStore.getItemAsync(storageKey),
      setItem: (storageKey: string, value: string) => SecureStore.setItemAsync(storageKey, value),
      removeItem: (storageKey: string) => SecureStore.deleteItemAsync(storageKey),
    };

export const supabase: SupabaseClient | null = url && key && !key.startsWith('replace-')
  ? createClient(url, key, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
