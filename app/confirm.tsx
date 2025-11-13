import React, { useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform, ToastAndroid } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getSealedItem, saveSealedItem } from '../utils/storage';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeImageSha256 } from '../utils/hashImage';
import { requestSigning } from '../utils/signingClient';

// Detection result shape (local definition if not imported from a model module)
export type DetectionResult = {
  model_id?: string;
  model_version?: string;
  model_hash?: string;
  score?: number;
  label?: string;
  explanation_ref?: string;
};

/**
 * Seal an image by requesting a remote signing service and persist mapping.
 * Steps:
 * 1. Compute image SHA-256 base64 hash (prefixed) via computeImageSha256.
 * 2. Build payload with capture, detection & uploader meta.
 * 3. Call requestSigning to obtain manifest URL/hash (& optional signed_manifest).
 * 4. Persist sealed image mapping using saveSealedItem.
 * 5. Update UI feedback state (sealing) & show toast/alerts.
 */
export async function sealImageAndSave(
  imageUri: string,
  detectionResult: DetectionResult | null,
  setSealing?: (v: boolean) => void
): Promise<void> {
  if (!imageUri) throw new Error('sealImageAndSave: imageUri is required');
  try {
    setSealing?.(true);
    // 1. Hash image
    const image_hash = await computeImageSha256(imageUri);

    // Optional user id from auth flow
    let optionalUserId: string | null = null;
    try {
      optionalUserId = (await AsyncStorage.getItem('auth:user_id')) || null;
    } catch {}

    // 2. Build payload
    const payload = {
      image_hash,
      capture: {
        timestamp: new Date().toISOString(),
        device_model: `${Device.manufacturer ?? 'Unknown'} ${Device.modelName ?? ''}`.trim(),
        app: 'SecureVision-Expo/1.0',
      },
      detection: {
        model_id: detectionResult?.model_id ?? null,
        model_version: detectionResult?.model_version ?? null,
        model_hash: detectionResult?.model_hash ?? null,
        score: detectionResult?.score ?? null,
        label: detectionResult?.label ?? null,
        explanation_ref: detectionResult?.explanation_ref ?? null,
      },
      uploader: {
        user_id: optionalUserId || null,
      },
    };

    // 3. Request remote signing
    const signing = await requestSigning(payload);

    // 4. Persist sealed mapping (include image hash for content-based lookup)
    await saveSealedItem({
      imageUri,
      imageHash: image_hash, // Store hash to enable lookup even with different URIs
      manifest_url: signing.manifest_url,
      manifest_hash: signing.manifest_hash,
      signed_manifest: signing.signed_manifest,
      sealed_at: new Date().toISOString(),
    });

    // 5. Success feedback: toast on Android; alert fallback for others
    if (Platform.OS === 'android') {
      ToastAndroid.show('Image sealed and saved', ToastAndroid.SHORT);
    } else {
      Alert.alert('Image Sealed', 'Image successfully sealed and saved.');
    }
  } catch (err: any) {
    const message = err?.message || String(err);
    Alert.alert('Seal Failed', message);
    throw err; // rethrow for test harness usage
  } finally {
    setSealing?.(false);
  }
}

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{ photo: string; metadata: string }>();
  const [sealing, setSealing] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);

  const photo = useMemo(() => {
    try { return params.photo ? JSON.parse(params.photo) : null; } catch { return null; }
  }, [params.photo]);
  const metadata = useMemo(() => {
    try { return params.metadata ? JSON.parse(params.metadata) : null; } catch { return null; }
  }, [params.metadata]);

  if (!photo) {
    return <View style={styles.center}><Text>Missing photo</Text></View>;
  }

  // Pre-check if already sealed using storage
  React.useEffect(() => {
    (async () => {
      if (!photo?.uri) return;
      try {
        const stored = await getSealedItem(photo.uri);
        if (stored && 'manifest_url' in stored) {
          setSealed(true);
          setManifestUrl(stored.manifest_url);
        }
      } catch {}
    })();
  }, [photo?.uri]);

  const onSeal = async () => {
    const imageUri = photo?.uri;
    if (!imageUri) return;
    const doSeal = async () => {
      try {
        await sealImageAndSave(imageUri, null, setSealing);
        const stored = await getSealedItem(imageUri);
        if (stored && 'manifest_url' in stored) {
          setManifestUrl(stored.manifest_url);
        }
        setSealed(true);
      } catch (e: any) {
        const message = e?.message || 'Failed to seal image';
        Alert.alert('Seal Failed', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => onSeal() },
        ]);
      }
    };
    await doSeal();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" />

      {sealed ? (
        <View style={[styles.card, { borderColor: '#22c55e', borderWidth: 1 }]}> 
          <Text style={styles.h2}>Sealed ✅</Text>
          {manifestUrl && (
            <Text selectable>Manifest URL: {manifestUrl}</Text>
          )}
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Metadata</Text>
            <Text>Timestamp: {metadata?.timestamp}</Text>
            {metadata?.location && (
              <Text>Location: {metadata.location.lat}, {metadata.location.lon} (±{Math.round(metadata.location.acc ?? 0)}m)</Text>
            )}
            <Text>Device ID: {metadata?.deviceId}</Text>
            <Text>Author: {metadata?.author}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Seal and save provenance"
            accessibilityHint="Computes a hash and requests a signed manifest from the server"
            disabled={sealing}
            onPress={onSeal}
            style={styles.primary}
          >
            {sealing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryText}>Seal & Save Provenance</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: 360, backgroundColor: '#000', borderRadius: 12 },
  card: { backgroundColor: '#f1f1f1', padding: 12, borderRadius: 8, marginTop: 12, gap: 6 },
  h2: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  primary: { backgroundColor: '#ffd33d', paddingVertical: 14, borderRadius: 8, marginTop: 16, alignItems: 'center' },
  primaryText: { fontWeight: '800', color: '#000' },
});
