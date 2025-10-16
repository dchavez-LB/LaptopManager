import { Platform } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

// Simple, safe wrappers that avoid importing expo-secure-store directly.
// On web, use localStorage. On native, call the native module via Expo's proxy
// only if it's available; otherwise, no-op/fallback.

const localStorageRef: Storage | undefined =
  typeof window !== 'undefined' ? window.localStorage : undefined;

function getNativeSecureStore(): any | null {
  try {
    // Access native module via proxy without importing expo-secure-store JS
    // This prevents requireNativeModule errors when the dev client lacks
    // the native module.
    // @ts-ignore
    const native = NativeModulesProxy?.ExpoSecureStore ?? null;
    return native || null;
  } catch (_) {
    return null;
  }
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorageRef?.setItem(key, value); } catch (_) {}
    return;
  }
  const native = getNativeSecureStore();
  try {
    if (native?.setItemAsync) {
      await native.setItemAsync(key, value);
    }
  } catch (_) {
    // silent fallback
  }
}

export async function secureGetItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorageRef?.getItem(key) ?? null; } catch (_) { return null; }
  }
  const native = getNativeSecureStore();
  try {
    if (native?.getItemAsync) {
      return await native.getItemAsync(key);
    }
    return null;
  } catch (_) {
    return null;
  }
}