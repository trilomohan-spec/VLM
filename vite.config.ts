import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
// @ts-expect-error no types bundled
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";

// Capacitor requires relative asset paths (base: "./") so the WebView
// can load files from the file:// origin on Android.
export default defineConfig({
  base: "./",
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    // Obfuscate the bundled JS so the source is unreadable if extracted from the APK
    obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: false, // keep false — true slows load time heavily
        deadCodeInjection: false,
        stringArray: true,
        rotateStringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,
        identifierNamesGenerator: "hexadecimal",
        selfDefending: false,
      },
    }),
  ],
  build: {
    outDir: "dist",
  },
});