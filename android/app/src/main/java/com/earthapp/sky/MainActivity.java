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
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;

import java.util.Collections;
import java.util.List;

public class MainActivity extends BridgeActivity {

    // local capacitor plugins, registered before super.onCreate so the bridge picks them up at init
    // time. exposed so PluginContractTest can assert registration without launching the activity
    static final List<Class<? extends Plugin>> LOCAL_PLUGINS = Collections.singletonList(
        WearNotificationBridgePlugin.class
    );

    private final WebViewRecovery recovery = new WebViewRecovery();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        for (Class<? extends Plugin> plugin : LOCAL_PLUGINS) {
            registerPlugin(plugin);
        }
        super.onCreate(savedInstanceState);

        applyAdaptiveBackground();

        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        if (!recovery.shouldRecover(SystemClock.elapsedRealtime())) {
                            return false; // crash loop ; let the OS handle it
                        }
                        runOnUiThread(MainActivity.this::recreate);
                        return true; // handled ; don't let Android kill the app
                    }
                }
            );
    }

    // androidx SplashScreen swaps back to the post-splash theme when the splash exits, and that
    // re-applies the theme's windowBackground over ours; measured as #FAFAFA winning on device
    @Override
    public void onResume() {
        super.onResume();
        applyAdaptiveBackground();
    }

    // uiMode is in the activity's configChanges, so a device dark-mode toggle never recreates us
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyAdaptiveBackground(newConfig.uiMode);
    }

    private void applyAdaptiveBackground() {
        applyAdaptiveBackground(getResources().getConfiguration().uiMode);
    }

    private void applyAdaptiveBackground(int uiMode) {
        SharedPreferences prefs = getSharedPreferences(ThemeResolver.PREFERENCES_STORE, MODE_PRIVATE);
        String stored = prefs.getString(ThemeResolver.THEME_PREFERENCE_KEY, null);
        int color = ThemeResolver.backgroundColor(stored, uiMode);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(color);
        }
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
    }
}
