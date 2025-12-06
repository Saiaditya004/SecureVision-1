import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';


const API_BASE_URL = 'http://13.204.69.94:5000';
/**
 * Sealed image item schema for manifest signing storage.
 */
export type SealedImageItem = {
  imageUri: string;
  imageHash?: string; // SHA-256 hash of the image content for lookup
  manifest_url: string;
  manifest_hash: string;
  signed_manifest?: any;
  sealed_at?: string; // ISO string when item was stored
};

// Keep local storage key for offline fallback
const STORAGE_KEY = 'sealed_items';
const USER_ID_KEY = 'user_id';

/**
 * Get or create a unique user ID for this device
 */
async function getUserId(): Promise<string> {
  let userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

/**
 * Save sealed item to BOTH server and local storage (for offline support)
 */
export async function saveSealedItem(item: SealedImageItem): Promise<void> {
  // Input validation
  if (!item.imageUri || typeof item.imageUri !== 'string') {
    throw new Error('saveSealedItem: imageUri must be a non-empty string');
  }
  if (!item.manifest_url || typeof item.manifest_url !== 'string') {
    throw new Error('saveSealedItem: manifest_url must be a non-empty string');
  }
  if (!item.manifest_hash || typeof item.manifest_hash !== 'string') {
    throw new Error('saveSealedItem: manifest_hash must be a non-empty string');
  }
  
  const sealedAt = item.sealed_at || new Date().toISOString();
  const itemWithTimestamp = { ...item, sealed_at: sealedAt };
  
  // Save to server first
  try {
    const userId = await getUserId();
    const response = await fetch(`${API_BASE_URL}/api/sealed-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        item: itemWithTimestamp
      })
    });
    
    if (!response.ok) {
      console.warn('Server save failed, falling back to local storage');
    }
  } catch (error) {
    console.error('Server save error:', error);
    // Continue to local save even if server fails
  }
  
  // Also save locally for offline access
  const list = await listSealedItems();
  const next: SealedImageItem[] = [
    itemWithTimestamp,
    ...list.filter(i => i.imageHash !== item.imageHash)
  ];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * List sealed items from SERVER first, fallback to local storage
 */
export async function listSealedItems(): Promise<SealedImageItem[]> {
  try {
    const userId = await getUserId();
    const response = await fetch(
      `${API_BASE_URL}/api/sealed-items?user_id=${encodeURIComponent(userId)}`
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.items || [];
    }
  } catch (error) {
    console.warn('Server list failed, using local storage:', error);
  }
  
  // Fallback to local storage
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}


export async function getSealedItemFromServer(imageHash: string): Promise<SealedImageItem | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/lookup-by-hash?image_hash=${encodeURIComponent(imageHash)}`
    );
    const data = await response.json();
    
    if (data.found) {
      return {
        imageUri: '', // No local URI for remote lookups
        imageHash: imageHash,
        manifest_url: data.manifest_url,
        manifest_hash: `sha256:${data.manifest_hash}`,
        signed_manifest: data.manifest,
      };
    }
    return null;
  } catch (error) {
    console.error('Server lookup failed:', error);
    return null;
  }
}

/**
 * Get sealed item - tries local first, then server
 */
export async function getSealedItem(imageUri: string, imageHash?: string): Promise<SealedImageItem | null> {
  const items = await listSealedItems(); // Now queries server
  
  // Try exact URI match
  const exactMatch = items.find(i => i.imageUri === imageUri);
  if (exactMatch) return exactMatch;
  
  // Try hash match
  if (imageHash) {
    const hashMatch = items.find(i => i.imageHash === imageHash);
    if (hashMatch) return hashMatch;
    
    // Final fallback: direct server lookup
    const serverMatch = await getSealedItemFromServer(imageHash);
    if (serverMatch) return serverMatch;
  }
  
  return null;
}

/**
 * Delete sealed item from BOTH server and local storage
 */
export async function deleteSealedItem(imageUri: string): Promise<SealedImageItem | null> {
  const list = await listSealedItems();
  const item = list.find(i => i.imageUri === imageUri);
  
  if (!item || !item.imageHash) return null;
  
  // Delete from server
  try {
    const userId = await getUserId();
    await fetch(
      `${API_BASE_URL}/api/sealed-items/${encodeURIComponent(item.imageHash)}?user_id=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    console.error('Server delete failed:', error);
  }
  
  // Delete from local storage
  const updated = list.filter(i => i.imageUri !== imageUri);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  
  return item;
}

/**
 * Save a file URI into the device media library (Photos/Gallery).
 * Creates an album named `albumName` if it does not exist.
 * If permissions are denied this becomes a no-op (but still returns).
 */
export async function saveToGallery(localUri: string, albumName = 'SecureVision'): Promise<void> {
  if (!localUri || typeof localUri !== 'string') return;
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (perm.status !== 'granted') return;

    // Create asset then add to (or create) album
    const asset = await MediaLibrary.createAssetAsync(localUri);
    const album = await MediaLibrary.getAlbumAsync(albumName);
    if (!album) {
      // createAlbumAsync will create the album and add the asset
      try {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } catch (e) {
        // On some platforms/createAlbum races it may fail; try addAssetsToAlbum instead
        try { await MediaLibrary.addAssetsToAlbumAsync([asset], albumName, false as any); } catch { /* ignore */ }
      }
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }
  } catch (e) {
    // Non-fatal: gallery saving shouldn't block the capture/seal flow
    // Keep a console.warn to aid debugging on device
    // eslint-disable-next-line no-console
    console.warn('saveToGallery failed', e);
  }
}
