export default {
  expo: {
    name: "SecureVision",
    slug: "SecureVision",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "securevision",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription:
          "Allow SecureVision to take photos for sealing with provenance.",
        NSLocationWhenInUseUsageDescription:
          "Attach GPS coordinates to photos you seal.",
        NSPhotoLibraryUsageDescription:
          "Allow selecting images for verification.",
        NSPhotoLibraryAddUsageDescription: "Save sealed images locally.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
      ],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // API Configuration - change this to your backend server address
      apiBaseUrl: process.env.API_BASE_URL || "http://192.168.0.7:5000",
    },
  },
};
