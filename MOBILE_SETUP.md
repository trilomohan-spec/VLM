# MSBG Scanner — Mobile Build Guide (Capacitor)

This project has been converted from a TanStack Start (SSR) web app to a **Capacitor SPA** that compiles to native Android and iOS apps.

---

## What changed vs. the original

| Area | Original | Mobile version |
|---|---|---|
| Framework | TanStack Start (SSR/Cloudflare) | Plain Vite SPA |
| Router history | Browser history | Hash history (`#/`) |
| Entry point | SSR shell | `index.html` + `src/main.tsx` |
| Print button | `window.print()` | Native OS share sheet (PDF) |
| Torch guard | No capability check | Checks `getCapabilities()` first |
| Build output | Cloudflare Worker bundle | `dist/` static files |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | https://nodejs.org |
| npm / pnpm | any | bundled with Node |
| Android Studio | latest | https://developer.android.com/studio |
| Xcode (iOS, Mac only) | ≥ 15 | Mac App Store |
| Java JDK | 17 | bundled with Android Studio |

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Build the web app

```bash
npm run build
```

This outputs a static site to `dist/`. Capacitor copies this into the native projects.

---

## Step 3 — Add native platforms (first time only)

```bash
# Android
npx cap add android

# iOS (Mac only)
npx cap add ios
```

---

## Step 4 — Sync web build into native projects

Run this every time after `npm run build`:

```bash
npm run cap:sync
# equivalent to: npx cap sync
```

---

## Step 5 — Run on a device / emulator

### Android
```bash
npm run cap:open:android   # opens Android Studio
# then click Run ▶ to deploy
```

Or directly via CLI (device must be connected via USB with developer mode on):
```bash
npm run cap:android
```

### iOS (Mac only)
```bash
npm run cap:open:ios       # opens Xcode
# then click Product → Run
```

---

## Camera & Flash permissions

Capacitor automatically declares the required permissions when you add the platforms. The relevant entries in the generated native files are:

**Android** (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

**iOS** (`ios/App/App/Info.plist`)
```xml
<key>NSCameraUsageDescription</key>
<string>Used to scan embossed machine serial number plates.</string>
```

If Capacitor doesn't add these automatically, add them manually.

---

## Share / PDF

The "Share" button uses the **Web Share API** (`navigator.share` with a PDF file). On Android and iOS this opens the native OS share sheet. If the device/browser doesn't support file sharing (desktop browsers), it falls back to a direct PDF download.

---

## App ID

The app ID is set in `capacitor.config.ts`:
```
appId: "com.triloautomation.serialscanner"
```
Change this before publishing to the stores.

---

## OCR backend (optional)

By default the app uses **Tesseract.js** (runs locally in the WebView — no server needed). To use a faster server-side OCR instead, set the environment variable at build time:

```bash
VITE_OCR_API=https://your-ocr-server.com npm run build
```

See `backend/README.md` for running the Python OCR server.
