package com.earthapp.sky.plugins;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

/**
 * Local Capacitor plugin that delivers notifications to a paired Wear OS watch
 * via Google's Wearable Data Layer. Counterpart to the iOS-side
 * {@code @capgo/capacitor-watch} forwarding wired in {@code useWatchNotifications}.
 *
 * <p>This is the phone side only. The watch receives via a {@code WearableListenerService}
 * implemented in a separate Wear OS app module. Until that module exists, sendMessage
 * calls resolve with delivered=0 (no connected nodes) ; which is fine: the call site
 * treats this as best-effort. Android's default behavior already bridges standard
 * push and local notifications to paired Wear OS watches, so users still see something
 * even without the data-layer pipeline.</p>
 *
 * <p>JS contract:
 * <pre>
 *   isAvailable() -> { available: boolean, nodeCount?: number }
 *   sendNotification({ id, title, body, type, source, link, createdAt })
 *     -> { delivered: number, error?: string }
 * </pre>
 * </p>
 */
@CapacitorPlugin(name = "WearNotificationBridge")
public class WearNotificationBridgePlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        Wearable.getNodeClient(context).getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                JSObject result = new JSObject();
                result.put("available", !nodes.isEmpty());
                result.put("nodeCount", nodes.size());
                call.resolve(result);
            })
            .addOnFailureListener(e -> {
                JSObject result = new JSObject();
                result.put("available", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            });
    }

    @PluginMethod
    public void sendNotification(PluginCall call) {
        Context context = getContext();
        JSObject payload = WearPayload.build(
            call.getString("id"),
            call.getString("title"),
            call.getString("body"),
            call.getString("type"),
            call.getString("source"),
            call.getString("link"),
            call.getLong("createdAt"),
            System.currentTimeMillis() / 1000L
        );

        byte[] bytes = WearPayload.encode(payload);
        MessageClient messageClient = Wearable.getMessageClient(context);

        Wearable.getNodeClient(context).getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                if (nodes.isEmpty()) {
                    JSObject result = new JSObject();
                    result.put("delivered", 0);
                    call.resolve(result);
                    return;
                }
                final int total = nodes.size();
                // Counters guarded by `lock` rather than AtomicInteger to keep this file
                // dependency-light ; the wear data layer doesn't pull in Guava/etc.
                final int[] delivered = {0};
                final int[] completed = {0};
                final Object lock = new Object();
                for (Node node : nodes) {
                    messageClient.sendMessage(node.getId(), WearPayload.NOTIFICATION_PATH, bytes)
                        .addOnSuccessListener(idr -> {
                            synchronized (lock) {
                                delivered[0]++;
                                completed[0]++;
                                if (completed[0] >= total) {
                                    JSObject r = new JSObject();
                                    r.put("delivered", delivered[0]);
                                    call.resolve(r);
                                }
                            }
                        })
                        .addOnFailureListener(e -> {
                            synchronized (lock) {
                                completed[0]++;
                                if (completed[0] >= total) {
                                    JSObject r = new JSObject();
                                    r.put("delivered", delivered[0]);
                                    r.put("error", e.getMessage());
                                    call.resolve(r);
                                }
                            }
                        });
                }
            })
            .addOnFailureListener(e -> {
                JSObject result = new JSObject();
                result.put("delivered", 0);
                result.put("error", e.getMessage());
                call.resolve(result);
            });
    }
}
