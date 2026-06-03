package com.earthapp.sky;

import android.os.Bundle;

import com.earthapp.sky.plugins.WearNotificationBridgePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local Capacitor plugins live in com.earthapp.sky.plugins and need to be
        // registered before super.onCreate so the Bridge picks them up at init time.
        registerPlugin(WearNotificationBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
