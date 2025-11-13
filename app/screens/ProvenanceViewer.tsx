import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, FlatList, Platform, ToastAndroid, Share } from 'react-native';
import { verifyManifestViaServer } from '../../utils/signingClient';
import { useLocalSearchParams } from 'expo-router';

/**
 * Props for ProvenanceViewer screen.
 */
export interface ProvenanceViewerProps {
  manifestUrl: string;
  imageUri?: string;
}

/**
 * Simplified verification result from server.
 */
export interface VerificationResult {
  ok: boolean;
  trust_level: 'high' | 'medium' | 'low' | 'server-signed' | string;
  signature_valid?: boolean;
  signer?: { type?: string; public_key_url?: string } | null;
  manifest?: any;
  ai_result?: {
    label?: string;
    score?: number; // 0..1
    model_id?: string;
    model_version?: string;
  } | null;
  timeline?: Array<{
    event: string;
    at?: string;
    notes?: string;
  }> | null;
}

/**
 * Minimal shape of manifest content we expect to display (best-effort).
 */
export interface ManifestMeta {
  version?: string;
  issued_at?: string;
  asset?: { hash?: string };
  capture?: {
    timestamp?: string;
    device_model?: string;
    app?: string;
  };
  detection?: {
    label?: string | null;
    score?: number | null;
    model_id?: string | null;
    model_version?: string | null;
    model_hash?: string | null;
    explanation_ref?: string | null;
  } | null;
  uploader?: { user_id?: string | null } | null;
}

/**
 * Renders a colored badge based on trust level.
 */
function TrustBadge({ level }: { level?: string }) {
  const { bg, text } = React.useMemo(() => {
    const l = (level || '').toLowerCase();
    if (l.includes('server-signed')) return { bg: '#22c55e', text: '✅ Server-signed' };
    if (l.startsWith('high') || l === 'trusted' || l === 'green') return { bg: '#22c55e', text: '✅ Trusted' };
    if (l.startsWith('med') || l === 'yellow') return { bg: '#f59e0b', text: '⚠️ Review' };
    return { bg: '#ef4444', text: '⛔ Untrusted' };
  }, [level]);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

/**
 * Screen to view provenance details for a sealed image/manifest.
 *
 * - Fetches the raw manifest JSON
 * - Calls server-side verification endpoint for simplified trust state
 * - Displays key metadata, AI inference summary, and a timeline
 */
export default function ProvenanceViewer(props: ProvenanceViewerProps) {
  // Allow both explicit props and route params via expo-router
  const params = useLocalSearchParams<{ manifestUrl?: string; imageUri?: string }>();
  const manifestUrl = props?.manifestUrl ?? (params?.manifestUrl as string | undefined) ?? '';
  const imageUri = props?.imageUri ?? (params?.imageUri as string | undefined);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [manifest, setManifest] = React.useState<any | null>(null);
  const [verification, setVerification] = React.useState<VerificationResult | null>(null);
  const [showRaw, setShowRaw] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!manifestUrl) {
      setError('Missing manifest URL');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) {
        const t = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to fetch manifest: ${t}`);
      }
      const json = await res.json();
      setManifest(json);

      const verify = await verifyManifestViaServer(manifestUrl);
      setVerification(verify as VerificationResult);
    } catch (e: any) {
      setError(e?.message || 'Failed to load provenance');
    } finally {
      setLoading(false);
    }
  }, [manifestUrl]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading provenance…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#ef4444', marginBottom: 8 }}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={load} accessibilityRole="button" accessibilityLabel="Retry loading provenance">
          <Text style={{ color: '#000', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ai = verification?.ai_result ?? {};
  const serverManifest: any = (verification as any)?.manifest ?? manifest;
  const meta: ManifestMeta = serverManifest || {};

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <TrustBadge level={verification?.trust_level} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.title}>Provenance</Text>
          {imageUri ? <Text numberOfLines={1} style={styles.subtle}>{imageUri}</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Verification</Text>
        <Text>OK: {String(verification?.ok ?? false)}</Text>
        <Text>Trust level: {verification?.trust_level ?? '—'}</Text>
        <Text>Signature: {verification?.signature_valid ? 'valid' : verification?.signature_valid === false ? 'invalid' : '—'}</Text>
        {verification?.signer?.type ? <Text>Signer type: {verification.signer.type}</Text> : null}
        {verification?.signer?.public_key_url ? (
          <TouchableOpacity
            onPress={async () => {
              try {
                await Share.share({ message: verification.signer!.public_key_url! });
                if (Platform.OS === 'android') ToastAndroid.show('Public key URL shared', ToastAndroid.SHORT);
              } catch {}
            }}
          >
            <Text selectable numberOfLines={1} style={{ color: '#2563eb' }}>Public key: {verification.signer.public_key_url}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {meta?.asset?.hash ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Asset</Text>
          <Text numberOfLines={1}>Hash: {meta.asset.hash}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.h2}>AI Analysis</Text>
        {ai?.label ? <Text>Label: {ai.label}</Text> : <Text>Label: —</Text>}
        <Text>Score: {typeof ai.score === 'number' ? ai.score.toFixed(3) : '—'}</Text>
        <Text>Model: {(ai.model_id || '—')} {(ai.model_version ? `v${ai.model_version}` : '')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Capture</Text>
        <Text>Timestamp: {meta?.capture?.timestamp || '—'}</Text>
        <Text>Device: {meta?.capture?.device_model || '—'}</Text>
        {meta?.capture?.app ? <Text>App: {meta.capture.app}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Detection</Text>
        <Text>Label: {meta?.detection?.label ?? '—'}</Text>
        <Text>Score: {typeof meta?.detection?.score === 'number' ? meta!.detection!.score!.toFixed(3) : '—'}</Text>
        <Text>Model ID: {meta?.detection?.model_id ?? '—'}</Text>
        <Text>Model Version: {meta?.detection?.model_version ?? '—'}</Text>
        <Text>Model Hash: {meta?.detection?.model_hash ?? '—'}</Text>
        <Text>Explanation Ref: {meta?.detection?.explanation_ref ?? '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Issuer & Metadata</Text>
        <Text>Issued at: {meta?.issued_at ?? '—'}</Text>
        <Text>Version: {meta?.version ?? '—'}</Text>
        <Text>Uploader: {meta?.uploader?.user_id ?? '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Timeline</Text>
        {verification?.timeline?.length ? (
          <FlatList
            data={verification.timeline}
            keyExtractor={(item, index) => `${item.event}-${item.at ?? index}`}
            renderItem={({ item }) => (
              <View style={styles.timelineRow}>
                <Text style={styles.timelineEvent}>{item.event}</Text>
                <Text style={styles.timelineAt}>{item.at || ''}</Text>
                {item.notes ? <Text style={styles.timelineNotes}>{item.notes}</Text> : null}
              </View>
            )}
          />
        ) : (
          <Text>No timeline events</Text>
        )}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open raw manifest"
        accessibilityHint="Expand to view the full manifest JSON"
        onPress={() => setShowRaw(v => !v)}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>{showRaw ? 'Hide Raw Manifest' : 'Open Raw Manifest'}</Text>
      </TouchableOpacity>

      {showRaw && (
        <ScrollView style={styles.rawBox} horizontal={true}>
          <Text selectable>{JSON.stringify(serverManifest, null, 2)}</Text>
        </ScrollView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontWeight: '800', fontSize: 18 },
  subtle: { color: '#666', maxWidth: 260 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#f1f1f1', padding: 12, borderRadius: 8, marginTop: 12, gap: 6 },
  h2: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  timelineRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  timelineEvent: { fontWeight: '700' },
  timelineAt: { color: '#444' },
  timelineNotes: { color: '#333' },
  primary: { backgroundColor: '#ffd33d', paddingVertical: 14, borderRadius: 8, marginTop: 16, alignItems: 'center' },
  primaryText: { fontWeight: '800', color: '#000' },
  retry: { backgroundColor: '#ffd33d', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  rawBox: { marginTop: 12, maxHeight: 260, backgroundColor: '#fff', borderRadius: 8, padding: 12 },
});
