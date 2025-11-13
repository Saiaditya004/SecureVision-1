import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';

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

// Storage key for sealed items
const STORAGE_KEY = 'sealed_items';

/**
 * Save a sealed image item.
 * Ensures deduplication by imageUri - if an item with the same imageUri exists, it will be replaced.
 *
 * @param item SealedImageItem to save
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
  
  const list = await listSealedItems();
  const sealedAt = item.sealed_at || new Date().toISOString();
  const next: SealedImageItem[] = [
    { ...item, sealed_at: sealedAt }, 
    ...list.filter(i => i.imageUri !== item.imageUri)
  ];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * List all sealed image items.
 * Returns items sorted by sealed_at (newest first).
 */
export async function listSealedItems(): Promise<SealedImageItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Get a single sealed image item by imageUri or imageHash.
 * First tries exact URI match, then falls back to hash-based lookup.
 * This allows verification of images even when selected from gallery with different URIs.
 *
 * @param imageUri The image URI to search for
 * @param imageHash Optional: SHA-256 hash of the image to search by content
 * @returns Matching item or null
 */
export async function getSealedItem(imageUri: string, imageHash?: string): Promise<SealedImageItem | null> {
  const items = await listSealedItems();
  
  // First try exact URI match (fastest)
  const exactMatch = items.find(i => i.imageUri === imageUri);
  if (exactMatch) return exactMatch;
  
  // If hash provided, try matching by content hash
  // This handles cases where the same image has different URIs (e.g., from gallery vs filesystem)
  if (imageHash) {
    const hashMatch = items.find(i => i.imageHash === imageHash);
    if (hashMatch) return hashMatch;
  }
  
  return null;
}

/**
 * Delete a sealed image item by its imageUri.
 * Returns the removed item if found, otherwise null.
 *
 * @param imageUri The image URI of the item to delete
 */
export async function deleteSealedItem(imageUri: string): Promise<SealedImageItem | null> {
  const list = await listSealedItems();
  const idx = list.findIndex(i => i.imageUri === imageUri);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return removed ?? null;
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
