import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getSealedItem } from '../utils/storage';
import { verifyManifestViaServer } from '../utils/signingClient';

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<any | null>(null);
  const [serverVer, setServerVer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      try {
        // Get sealed item data
        const data = await getSealedItem(String(id));
        setItem(data);
        
        // If we have a manifest URL, verify it
        if (data && data.manifest_url) {
          try {
            const verify = await verifyManifestViaServer(data.manifest_url);
            setServerVer(verify);
          } catch (err) {
            console.warn('Failed to verify manifest:', err);
          }
        }
      } catch (err) {
        console.error('Failed to load item:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>Loading…</Text></View>;
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text>Item not found</Text>
      </View>
    );
  }

  const manifest = serverVer?.manifest;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Image 
        source={{ uri: item.imageUri }} 
        style={{ width: '100%', height: 320, borderRadius: 12, backgroundColor: '#000' }} 
        resizeMode="contain" 
      />
      
      {/* Server verification summary */}
      {serverVer && (
        <View style={styles.card}>
          <Text style={styles.h2}>Verification Status</Text>
          <Text>✓ OK: {String(serverVer?.ok ?? false)}</Text>
          <Text>Trust level: {serverVer?.trust_level ?? '—'}</Text>
          <Text>Signature: {serverVer?.signature_valid ? '✓ Valid' : serverVer?.signature_valid === false ? '✗ Invalid' : '—'}</Text>
        </View>
      )}

      {/* Capture details from server manifest */}
      {manifest?.capture && (
        <View style={styles.card}>
          <Text style={styles.h2}>Capture Details</Text>
          <Text>Timestamp: {manifest.capture?.timestamp || '—'}</Text>
          <Text>Device: {manifest.capture?.device_model || '—'}</Text>
          {manifest.capture?.app && <Text>App: {manifest.capture.app}</Text>}
        </View>
      )}

      {/* Detection summary */}
      {manifest?.detection && (
        <View style={styles.card}>
          <Text style={styles.h2}>Detection Summary</Text>
          <Text>Label: {manifest.detection?.label ?? '—'}</Text>
          <Text>Score: {typeof manifest.detection?.score === 'number' ? manifest.detection.score.toFixed(3) : '—'}</Text>
        </View>
      )}

      {/* Manifest info */}
      {item?.manifest_url && (
        <View style={styles.card}>
          <Text style={styles.h2}>Provenance Info</Text>
          <Text numberOfLines={1} style={{ fontSize: 11 }}>URL: {item.manifest_url}</Text>
          <Text numberOfLines={1} style={{ fontSize: 11 }}>Hash: {item.manifest_hash}</Text>
        </View>
      )}

      {/* Provenance viewer button */}
      {item?.manifest_url && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View full provenance details"
          accessibilityHint="Opens detailed provenance viewer"
          style={styles.primary}
          onPress={() => router.push({ 
            pathname: '/screens/ProvenanceViewer', 
            params: { 
              manifestUrl: item.manifest_url, 
              imageUri: item.imageUri 
            } 
          })}
        >
          <Text style={styles.primaryText}>View Full Provenance</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#f1f1f1', padding: 12, borderRadius: 8 },
  h2: { fontWeight: '700' },
  primary: { backgroundColor: '#ffd33d', paddingVertical: 12, borderRadius: 8, marginTop: 8, alignItems: 'center' },
  primaryText: { fontWeight: '800', color: '#000' },
});
