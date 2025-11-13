import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

/**
 * Compute a SHA-256 hash of an image file given its URI.
 *
 * The file is read as a Base64 string using Expo FileSystem and then
 * hashed with Expo Crypto. The returned value is prefixed with "sha256:".
 *
 * @example
 * ```ts
 * const uri = await pickImage(); // however you obtain the local image URI
 * const hash = await computeImageSha256(uri);
 * console.log('Image hash:', hash); // e.g. "sha256:abcdef..."
 * ```
 *
 * @param imageUri - A file URI resolvable by expo-file-system (e.g. from ImagePicker)
 * @returns The hex SHA-256 digest prefixed with "sha256:"
 * @throws Error if the file cannot be read or the hash cannot be computed
 */
export async function computeImageSha256(imageUri: string): Promise<string> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('computeImageSha256: imageUri must be a non-empty string.');
  }

  try {
    // Read as base64; FileSystem.readAsStringAsync expects a URI like file:///...
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      throw new Error('Empty file content read from URI: ' + imageUri);
    }

    const hexDigest = await sha256HexFromBase64(base64);
    return `sha256:${hexDigest}`;
  } catch (err: any) {
    const message = err?.message || String(err);
    throw new Error(`computeImageSha256: Failed to hash image at URI "${imageUri}": ${message}`);
  }
}

/**
 * Helper to compute SHA-256 hex digest from a base64-encoded string.
 * Provided separately to simplify unit testing with small fixture strings.
 *
 * @param base64 - Base64-encoded content to hash
 * @returns Hex string (lowercase) representing the SHA-256 digest
 * @throws Error if hashing fails
 */
export async function sha256HexFromBase64(base64: string): Promise<string> {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('sha256HexFromBase64: base64 must be a non-empty string.');
  }
  try {
    // Expo Crypto can hash arbitrary strings directly.
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return digest;
  } catch (err: any) {
    const message = err?.message || String(err);
    throw new Error(`sha256HexFromBase64: Failed to compute digest: ${message}`);
  }
}

// Example (commented):
// (async () => {
//   const exampleUri = 'file:///path/to/image.jpg';
//   try {
//     const hash = await computeImageSha256(exampleUri);
//     console.log('Hash:', hash);
//   } catch (e) {
//     console.error('Hashing failed:', e);
//   }
// })();
