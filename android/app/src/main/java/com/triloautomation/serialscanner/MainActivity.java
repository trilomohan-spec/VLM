package com.triloautomation.serialscanner;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.Manifest;
import android.content.pm.PackageManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private PermissionRequest pendingPermissionRequest;

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        // Native print bridge
        webView.addJavascriptInterface(new PrintInterface(this, webView), "AndroidPrint");

        // Native torch bridge
        webView.addJavascriptInterface(new TorchInterface(this), "AndroidTorch");

        // Handle getUserMedia camera permissions
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                pendingPermissionRequest = request;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.CAMERA},
                            CAMERA_PERMISSION_REQUEST
                    );
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        }
    }

    // Print bridge
    class PrintInterface {
        private final Context context;
        private final WebView webView;

        PrintInterface(Context context, WebView webView) {
            this.context = context;
            this.webView = webView;
        }

        @JavascriptInterface
        public void print() {
            ((MainActivity) context).runOnUiThread(() -> {
                PrintManager printManager =
                        (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter printAdapter =
                        webView.createPrintDocumentAdapter("Barcode Label");
                if (printManager != null) {
                    printManager.print(
                            "Barcode Label",
                            printAdapter,
                            new PrintAttributes.Builder().build()
                    );
                }
            });
        }
    }

    // Torch bridge — controls the native flashlight via CameraManager
    class TorchInterface {
        private final Context context;

        TorchInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void setTorch(boolean on) {
            try {
                CameraManager cm = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                    Boolean hasFlash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                    if (hasFlash != null && hasFlash
                            && facing != null
                            && facing == CameraCharacteristics.LENS_FACING_BACK) {
                        cm.setTorchMode(id, on);
                        break;
                    }
                }
            } catch (Exception e) {
                // ignore — device may not support flash
            }
        }
    }
}