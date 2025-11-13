import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { saveToGallery } from '../../utils/storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [locGranted, setLocGranted] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocGranted(status === 'granted');
    })();
  }, [permission, requestPermission]);

  const takePhoto = async () => {
    try {
      if (!cameraRef.current) return;
      setLoading(true);
  const photo = await cameraRef.current.takePictureAsync({ quality: 1, exif: true });

  // Persist the temp camera file immediately to avoid it being GC’d before sealing
  const capturesDir = FileSystem.documentDirectory + 'captures/';
  await FileSystem.makeDirectoryAsync(capturesDir, { intermediates: true });
  const clean = (photo.uri || '').split('?')[0];
  const ext = clean.includes('.') ? clean.substring(clean.lastIndexOf('.') + 1) : 'jpg';
  const persisted = `${capturesDir}${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: photo.uri, to: persisted });
  const photoPersisted = { ...photo, uri: persisted };
      // Also save to device media library (Photos/Gallery) where possible
      try {
        await saveToGallery(persisted);
      } catch (e) {
        // non-fatal: continue to confirm screen regardless
        console.warn('Failed saving to gallery', e);
      }

      let coords: Location.LocationObject['coords'] | undefined;
      if (locGranted) {
        const loc = await Location.getCurrentPositionAsync({});
        coords = loc.coords;
      }

      const metadata = {
        timestamp: new Date().toISOString(),
        location: coords ? { lat: coords.latitude, lon: coords.longitude, acc: coords.accuracy } : undefined,
        deviceId: Device.osBuildId ?? Device.deviceName ?? 'unknown-device',
        author: 'SecureVision User',
      };

  router.push({ pathname: '/confirm', params: { photo: JSON.stringify(photoPersisted), metadata: JSON.stringify(metadata) } } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to take photo');
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}> 
        <ActivityIndicator />
        <Text>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}><Text style={styles.buttonText}>Grant</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {isFocused ? (
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#000' }} />
      )}
      <View style={styles.controls}>
        <TouchableOpacity onPress={takePhoto} style={styles.captureBtn} disabled={loading || !isFocused}>
          {loading ? <ActivityIndicator color="#000"/> : <Text style={styles.captureText}>Capture</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  button: { backgroundColor: '#ffd33d', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  buttonText: { fontWeight: '600' },
  controls: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  captureBtn: { backgroundColor: '#ffd33d', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28 },
  captureText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
