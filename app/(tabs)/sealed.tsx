import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { listSealedItems, deleteSealedItem } from '../../utils/storage';
import { router, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system';

export default function SealedListScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const sealedItems = await listSealedItems();
    // Sort newest first
    const sorted = sealedItems.sort((a, b) => {
      const dateA = new Date(a.sealed_at || 0).getTime();
      const dateB = new Date(b.sealed_at || 0).getTime();
      return dateB - dateA;
    });
    setItems(sorted);
    setLoading(false);
  };

  const onDelete = async (imageUri: string) => {
    Alert.alert(
      'Delete Sealed Image',
      'Are you sure you want to delete this sealed image and its provenance data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSealedItem(imageUri);
              // Best-effort: remove the image file if it's in our app directory
              if (imageUri?.includes('file://')) {
                try { 
                  await FileSystem.deleteAsync(imageUri, { idempotent: true }); 
                } catch {}
              }
              await load();
            } catch (e: any) {
              Alert.alert('Delete failed', String(e?.message ?? e));
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (!items.length) {
    return (
      <View style={styles.center}>
        <Text>No sealed images yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, gap: 12 }}
      data={items}
      keyExtractor={(item) => item.imageUri}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', flex: 1, alignItems: 'center', gap: 12 }} 
            onPress={() => router.push({ pathname: '/details', params: { id: item.imageUri } } as any)}
          >
            <Image source={{ uri: item.imageUri }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.title}>SecureVision</Text>
              <Text style={styles.meta}>
                {new Date(item.sealed_at || Date.now()).toLocaleString()}
              </Text>
              <Text style={[styles.badge, styles.badgeValid]}>✓ Sealed</Text>
              {item.manifest_url && (
                <Text numberOfLines={1} style={{ color: '#2563eb', fontSize: 11, marginTop: 4 }}>
                  {item.manifest_url}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item.imageUri)} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#f7f7f7', padding: 10, borderRadius: 8 },
  thumb: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#ddd' },
  title: { fontWeight: '700' },
  meta: { color: '#666', fontSize: 12 },
  badge: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, color: '#000', fontWeight: '700', textTransform: 'capitalize' },
  badgeValid: { backgroundColor: '#b7f7c5' },
  badgeBad: { backgroundColor: '#f7b7b7' },
  badgeNeutral: { backgroundColor: '#f0e68c' },
  deleteBtn: { backgroundColor: '#ff4d4f', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  deleteText: { color: '#fff', fontWeight: '700' },
});
