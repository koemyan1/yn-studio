import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ynstudio.app",
  appName: "YN Studio",
  webDir: "dist",
  android: {
    useLegacyBridge: true
  }
};

export default config;
