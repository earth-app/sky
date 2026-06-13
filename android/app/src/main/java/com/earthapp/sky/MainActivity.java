package com.earthapp.sky;

import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.earthapp.sky.plugins.WearNotificationBridgePlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // Match --ion-background-color in src/assets/css/main.css so the webview's own
    // background never flashes a contrasting color during scroll/transition. There's
    // no static backgroundColor in capacitor.config.ts on purpose (it would flash),
    // so we set it here, adaptively.
    private static final int BG_LIGHT = 0xFFF3F2F9;
    private static final int BG_DARK = 0xFF1C1B22;

    // Guard against a render-process crash loop recreating the activity forever.
    private long lastRecreateAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local Capacitor plugins live in com.earthapp.sky.plugins and need to be
        // registered before super.onCreate so the Bridge picks them up at init time.
        registerPlugin(WearNotificationBridgePlugin.class);
        super.onCreate(savedInstanceState);

        applyAdaptiveBackground();

        // Capacitor doesn't recover the WebView when Android kills its render process
        // (OOM) — without this the app shows a blank, dead screen until a full
        // restart. Rebuild the activity so a fresh WebView is created.
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastRecreateAt < 5_000) {
                            return false; // crash loop — let the OS handle it
                        }
                        lastRecreateAt = now;
                        runOnUiThread(MainActivity.this::recreate);
                        return true; // handled — don't let Android kill the app
                    }
                }
            );
    }

    private void applyAdaptiveBackground() {
        int color = isDarkTheme() ? BG_DARK : BG_LIGHT;
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(color);
        }
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
    }

    // Prefer the in-app theme (Capacitor Preferences), falling back to the device
    // night-mode setting when the app is on "system".
    private boolean isDarkTheme() {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String stored = prefs.getString("app.setting.theme", null);
        if (stored != null) {
            String theme = stored.replace("\"", "");
            if ("dark".equals(theme)) return true;
            if ("light".equals(theme)) return false;
        }
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }
}
