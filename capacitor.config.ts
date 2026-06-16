import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.triloautomation.serialscanner",
  appName: "EZI",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    // Allow the WebView to make plain http:// requests to the local network OCR server
    allowMixedContent: true,
  },
};

export default config;