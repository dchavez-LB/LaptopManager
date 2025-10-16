import { Platform, StatusBar } from 'react-native';

export function getAdaptiveTopPadding(): number {
  try {
    return Platform.OS === 'android'
      ? ((StatusBar.currentHeight || 24) + 12)
      : 32;
  } catch {
    return 32;
  }
}