import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getSealedItem } from '../../utils/storage';
import { verifyManifestViaServer } from '../../utils/signingClient';
import { computeImageSha256 } from '../../utils/hashImage';

export default function VerifyScreen() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const img = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      quality: 1 
    });
    if (!img.canceled && img.assets?.[0]?.uri) {
      setPicked(img.assets[0].uri);
      setResult(null); // Clear previous results
    }
  };

  const onVerify = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      // Step 1: Compute image hash first (needed for lookup and verification)
      const currentImageHash = await computeImageSha256(picked);
      
      // Step 2: Check if this image has a sealed manifest in storage
      // Pass the hash to enable content-based lookup (handles gallery URIs)
      const sealedItem = await getSealedItem(picked, currentImageHash);
      
      if (!sealedItem) {
        setResult({
          status: 'none',
          message: 'This image has no provenance data. Images must be sealed first.',
        });
        setBusy(false);
        return;
      }

      // Step 3: Verify the manifest signature via server
      const serverVerification = await verifyManifestViaServer(sealedItem.manifest_url);
      
      // Step 4: Compare current image hash with manifest
      const manifestAssetHash = serverVerification?.manifest?.asset?.hash || '';
      const hashesMatch = currentImageHash === manifestAssetHash;

      // Step 5: Build comprehensive result
      const errors: string[] = [];
      if (!serverVerification.signature_valid) {
        errors.push('Signature verification failed');
      }
      if (!hashesMatch) {
        errors.push('Image hash mismatch - image may have been tampered');
      }

      const verificationResult = {
        status: serverVerification.ok && hashesMatch ? 'valid' : 'tampered',
        signatureValid: serverVerification.signature_valid,
        hashMatch: hashesMatch,
        trustLevel: serverVerification.trust_level,
        manifestUrl: sealedItem.manifest_url,
        manifestHash: sealedItem.manifest_hash,
        currentHash: currentImageHash,
        expectedHash: manifestAssetHash,
        manifest: serverVerification.manifest,
        signer: serverVerification.signer,
        errors,
      };

      setResult(verificationResult);
    } catch (error: any) {
      Alert.alert('Verification Error', error?.message || 'Failed to verify image');
      setResult({
        status: 'error',
        message: error?.message || 'Verification failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <TouchableOpacity onPress={pick} style={styles.primary}>
        <Text style={styles.primaryText}>Pick Image to Verify</Text>
      </TouchableOpacity>
      
      {picked && (
        <Image 
          source={{ uri: picked }} 
          style={{ width: '100%', height: 280, borderRadius: 12, backgroundColor: '#000' }} 
          resizeMode="contain"
        />
      )}
      
      <TouchableOpacity 
        onPress={onVerify} 
        disabled={!picked || busy} 
        style={[styles.primary, (!picked || busy) && styles.disabled]}
      >
        {busy ? <ActivityIndicator color="#000"/> : <Text style={styles.primaryText}>Verify Provenance</Text>}
      </TouchableOpacity>
      
      {result && (
        <View style={[styles.card, result.status === 'valid' && styles.cardValid, result.status === 'tampered' && styles.cardError]}>
          <Text style={styles.h2}>Verification Result</Text>
          <Text style={styles.statusText}>
            Status: <Text style={styles.bold}>{result.status?.toUpperCase()}</Text>
          </Text>
          
          {result.status === 'none' && (
            <Text style={{ marginTop: 8, color: '#666' }}>
              💡 This image has no provenance data. Seal an image using the Camera tab first, 
              then verify it here to see full provenance details.
            </Text>
          )}

          {result.status === 'valid' && (
            <>
              <Text style={{ marginTop: 8, color: '#059669' }}>✅ Image is authentic and unmodified</Text>
              {result.trustLevel && <Text>Trust Level: {result.trustLevel}</Text>}
              {result.signatureValid !== undefined && (
                <Text>Signature: {result.signatureValid ? '✓ Valid' : '✗ Invalid'}</Text>
              )}
              {result.hashMatch !== undefined && (
                <Text>Content Hash: {result.hashMatch ? '✓ Matches' : '✗ Mismatch'}</Text>
              )}
            </>
          )}

          {result.status === 'tampered' && (
            <>
              <Text style={{ marginTop: 8, color: '#dc2626' }}>⚠️ Image verification failed</Text>
              {result.errors?.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.bold}>Issues found:</Text>
                  {result.errors.map((err: string, idx: number) => (
                    <Text key={idx} style={{ color: '#dc2626' }}>• {err}</Text>
                  ))}
                </View>
              )}
            </>
          )}

          {result.status === 'error' && (
            <Text style={{ marginTop: 8, color: '#dc2626' }}>{result.message}</Text>
          )}

          {result.manifest?.capture && (
            <View style={[styles.card, { marginTop: 12, backgroundColor: '#fff' }]}> 
              <Text style={styles.h2}>Capture Details</Text>
              <Text>Timestamp: {result.manifest.capture.timestamp || '—'}</Text>
              <Text>Device: {result.manifest.capture.device_model || '—'}</Text>
              {result.manifest.capture.app && <Text>App: {result.manifest.capture.app}</Text>}
            </View>
          )}

          {result.manifest?.detection && (
            <View style={[styles.card, { marginTop: 8, backgroundColor: '#fff' }]}> 
              <Text style={styles.h2}>Detection Info</Text>
              <Text>Label: {result.manifest.detection.label ?? '—'}</Text>
              {result.manifest.detection.score !== null && (
                <Text>Score: {result.manifest.detection.score?.toFixed(3)}</Text>
              )}
            </View>
          )}

          {result.manifestUrl && (
            <Text style={{ marginTop: 12, fontSize: 11, color: '#2563eb' }} numberOfLines={1}>
              Manifest: {result.manifestUrl}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  primary: { backgroundColor: '#ffd33d', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  primaryText: { fontWeight: '800', color: '#000' },
  disabled: { opacity: 0.5 },
  card: { backgroundColor: '#f1f1f1', padding: 12, borderRadius: 8 },
  cardValid: { borderColor: '#059669', borderWidth: 2 },
  cardError: { borderColor: '#dc2626', borderWidth: 2 },
  h2: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  statusText: { fontSize: 15 },
  bold: { fontWeight: '700' },
});
