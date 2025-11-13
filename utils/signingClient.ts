/**
 * Signing/verification client utilities for interacting with server endpoints.
 *
 * Uses the global fetch API available in Expo/React Native.
 */

import Constants from 'expo-constants';

export type SigningPayload = Record<string, unknown>;

export interface SigningResponse {
  manifest_url: string;
  manifest_hash: string;
  signed_manifest?: any;
}

// Get API base URL from app config or fall back to localhost
const BASE_URL = 'http://192.168.0.7:5000';

/**
 * Request the server to sign a manifest for the given payload.
 *
 * Performs a POST to `${BASE_URL}/api/sign-manifest` with JSON body.
 * - On success (2xx): returns parsed JSON matching SigningResponse.
 * - On failure (non-2xx): throws Error containing response text.
 *
 * @example
 * ```ts
 * import { requestSigning } from '@/utils/signingClient';
 *
 * const res = await requestSigning({ claim: 'example' });
 * console.log(res.manifest_url, res.manifest_hash);
 * ```
 *
 * @param payload - Arbitrary JSON payload sent to the signing endpoint
 * @returns The server's signing response
 * @throws Error for network issues or non-2xx server responses
 */
export async function requestSigning(payload: SigningPayload): Promise<SigningResponse> {
  const url = `${BASE_URL}/api/sign-manifest`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload ?? {}),
    });

    if (!response.ok) {
      let message = '';
      try {
        message = await response.text();
      } catch {
        message = `HTTP ${response.status} ${response.statusText}`;
      }
      console.error('requestSigning: server error', { status: response.status, body: message });
      throw new Error(`requestSigning failed (${response.status} ${response.statusText}): ${message}`);
    }

    const data = (await response.json()) as SigningResponse;
    return data;
  } catch (err: any) {
    console.error('requestSigning: network or parsing error', err);
    const message = err?.message || String(err);
    throw new Error(`requestSigning: ${message}`);
  }
}

/**
 * Ask the server to verify a manifest by URL.
 *
 * Performs a GET to `${BASE_URL}/api/verify-manifest?url=...`.
 * Returns parsed JSON on success; throws Error with response text on non-2xx.
 *
 * @example
 * ```ts
 * import { verifyManifestViaServer } from '@/utils/signingClient';
 *
 * const result = await verifyManifestViaServer('https://example.com/manifest.c2pa');
 * console.log('verification:', result);
 * ```
 *
 * @param manifestUrl - The URL to the manifest to verify
 * @returns Parsed JSON returned by the server
 * @throws Error for network issues or non-2xx server responses
 */
export async function verifyManifestViaServer(manifestUrl: string): Promise<any> {
  if (!manifestUrl || typeof manifestUrl !== 'string') {
    throw new Error('verifyManifestViaServer: manifestUrl must be a non-empty string');
  }

  const url = `${BASE_URL}/api/verify-manifest?url=${encodeURIComponent(manifestUrl)}`;

  try {
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      let message = '';
      try {
        message = await response.text();
      } catch {
        message = `HTTP ${response.status} ${response.statusText}`;
      }
      console.error('verifyManifestViaServer: server error', { status: response.status, body: message });
      throw new Error(`verifyManifestViaServer failed (${response.status} ${response.statusText}): ${message}`);
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.error('verifyManifestViaServer: network or parsing error', err);
    const message = err?.message || String(err);
    throw new Error(`verifyManifestViaServer: ${message}`);
  }
}
