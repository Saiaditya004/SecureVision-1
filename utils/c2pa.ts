import * as FileSystem from 'expo-file-system/legacy';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// NOTE: Real C2PA sealing on-device is not supported by Expo in a pure-JS way today.
// This module simulates manifest creation and sealing locally, and leaves clear
// TODO hooks to integrate with a backend (Rust C2PA) or a native module.

export type Manifest = {
  timestamp: string;
  location?: { lat: number; lon: number; acc?: number };
  deviceId?: string;
  author?: string;
};

export type Verification = {
  status: 'valid' | 'tampered' | 'none';
  issuer?: string;
  errors?: string[];
  matchedBy?: 'uri' | 'filename' | 'hash';
  linkedUri?: string; // the sealed file the manifest references
  sidecar?: string;   // the sidecar json filename
  fileHash?: string;  // content hash used for matching
};

export function generateManifest(meta: Partial<Manifest>): Manifest {
  return {
    timestamp: meta.timestamp ?? new Date().toISOString(),
    location: meta.location,
    deviceId: meta.deviceId,
    author: meta.author ?? 'SecureVision User',
  };
}

function simpleHashHex(input: string) {
  // lightweight non-crypto hash for demo only.
  const bytes = new TextEncoder().encode(input);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) hash = (hash * 33 + bytes[i]) >>> 0;
  return ('00000000' + hash.toString(16)).slice(-8);
}

async function fileContentHash(uri: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return simpleHashHex(base64);
  } catch {
    return simpleHashHex(uri);
  }
}

export async function sealImage(photo: { uri: string }, manifest: Manifest): Promise<{ id: string; uri: string; manifest: Manifest; verification: Verification; hash: string }>
{
  // Simulate sealing by writing a sidecar JSON with the image.
  const id = uuidv4();
  const sealedDir = FileSystem.documentDirectory + 'sealed/';
  await FileSystem.makeDirectoryAsync(sealedDir, { intermediates: true });

  const base = photo.uri.split('?')[0];
  const fileExt = base.includes('.') ? base.substring(base.lastIndexOf('.') + 1) : 'jpg';
  const target = sealedDir + id + '.' + fileExt;
  try {
    await FileSystem.copyAsync({ from: photo.uri, to: target });
  } catch {
    // Best-effort fallback: if source missing, skip copy and keep original uri
    const fallbackHash = await fileContentHash(photo.uri);
    const sidecar = sealedDir + id + '.manifest.json';
    await FileSystem.writeAsStringAsync(sidecar, JSON.stringify({ manifest, linked: photo.uri, fileHash: fallbackHash }), { encoding: FileSystem.EncodingType.UTF8 });
    return {
      id,
      uri: photo.uri,
      manifest,
      verification: { status: 'valid', issuer: 'SecureVision Demo Issuer', matchedBy: 'uri', linkedUri: photo.uri, sidecar, fileHash: fallbackHash },
      hash: fallbackHash,
    };
  }

  const sidecar = sealedDir + id + '.manifest.json';
  const fileHash = await fileContentHash(target);
  await FileSystem.writeAsStringAsync(sidecar, JSON.stringify({ manifest, linked: target, fileHash }), { encoding: FileSystem.EncodingType.UTF8 });

  const hash = fileHash;
  return { id, uri: target, manifest, verification: { status: 'valid', issuer: 'SecureVision Demo Issuer', matchedBy: 'uri', linkedUri: target, sidecar, fileHash }, hash };
}

export async function verifyImage(image: { uri: string }): Promise<Verification & { manifest?: Manifest }>
{
  const sealedDir = FileSystem.documentDirectory + 'sealed/';
  try {
    const files = await FileSystem.readDirectoryAsync(sealedDir);
    const manifestSidecar = files.find(f => f.endsWith('.manifest.json'));
    if (!manifestSidecar) return { status: 'none' };
    const pickedHash = await fileContentHash(image.uri);
    // Attempt multiple matching strategies:
    // 1) Exact linked URI match
    for (const f of files.filter(f => f.endsWith('.manifest.json'))) {
      const sidecarPath = sealedDir + f;
      const content = await FileSystem.readAsStringAsync(sidecarPath, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(content);
      if (parsed.linked === image.uri) {
        if (parsed.fileHash && parsed.fileHash === pickedHash) {
          return { status: 'valid', issuer: 'SecureVision Demo Issuer', manifest: parsed.manifest, matchedBy: 'uri', linkedUri: parsed.linked, sidecar: sidecarPath, fileHash: parsed.fileHash };
        }
        return { status: 'tampered', issuer: 'SecureVision Demo Issuer', manifest: parsed.manifest, matchedBy: 'uri', linkedUri: parsed.linked, sidecar: sidecarPath, fileHash: parsed.fileHash, errors: [`Hash mismatch: expected ${parsed.fileHash}, got ${pickedHash}`] };
      }
    }
    // 2) Match by filename (media pickers may give a different path)
    const pickedBase = image.uri.split('?')[0];
    const pickedName = pickedBase.substring(pickedBase.lastIndexOf('/') + 1);
    for (const f of files.filter(f => f.endsWith('.manifest.json'))) {
      const sidecarPath = sealedDir + f;
      const content = await FileSystem.readAsStringAsync(sidecarPath, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(content);
      const linkedBase = String(parsed.linked || '').split('?')[0];
      const linkedName = linkedBase.substring(linkedBase.lastIndexOf('/') + 1);
      if (linkedName && pickedName && linkedName === pickedName) {
        if (parsed.fileHash && parsed.fileHash === pickedHash) {
          return { status: 'valid', issuer: 'SecureVision Demo Issuer', manifest: parsed.manifest, matchedBy: 'filename', linkedUri: parsed.linked, sidecar: sidecarPath, fileHash: parsed.fileHash };
        }
        return { status: 'tampered', issuer: 'SecureVision Demo Issuer', manifest: parsed.manifest, matchedBy: 'filename', linkedUri: parsed.linked, sidecar: sidecarPath, fileHash: parsed.fileHash, errors: [`Hash mismatch: expected ${parsed.fileHash}, got ${pickedHash}`] };
      }
    }
    // 3) Match by image content hash
    for (const f of files.filter(f => f.endsWith('.manifest.json'))) {
      const sidecarPath = sealedDir + f;
      const content = await FileSystem.readAsStringAsync(sidecarPath, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(content);
      if (parsed.fileHash && parsed.fileHash === pickedHash) {
        return { status: 'valid', issuer: 'SecureVision Demo Issuer', manifest: parsed.manifest, matchedBy: 'hash', linkedUri: parsed.linked, sidecar: sidecarPath, fileHash: parsed.fileHash };
      }
    }
    return { status: 'none' };
  } catch (e: any) {
    return { status: 'none', errors: [String(e?.message ?? e)] };
  }
}
