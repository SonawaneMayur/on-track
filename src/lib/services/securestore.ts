// The secret iCal URL is a credential (BUILD.md security model). On device it
// goes in the iOS Keychain / Android Keystore via @aparajita/capacitor-secure-storage.
// In the browser there is no Keychain; we fall back to sessionStorage and make
// the downgrade explicit so it's never mistaken for secure on-device storage.
import { Capacitor } from '@capacitor/core';

const PREFIX = 'feedUrl:';

export async function setFeedUrl(feedId: string, url: string): Promise<void> {
  const key = PREFIX + feedId;
  if (Capacitor.isNativePlatform()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.set(key, url);
  } else {
    sessionStorage.setItem(key, url);
  }
}

export async function getFeedUrl(feedId: string): Promise<string | null> {
  const key = PREFIX + feedId;
  if (Capacitor.isNativePlatform()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const v = await SecureStorage.get(key).catch(() => null);
    return typeof v === 'string' ? v : null;
  }
  return sessionStorage.getItem(key);
}

export async function deleteFeedUrl(feedId: string): Promise<void> {
  const key = PREFIX + feedId;
  if (Capacitor.isNativePlatform()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.remove(key).catch(() => {});
  } else {
    sessionStorage.removeItem(key);
  }
}

export function isSecureStorageAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
