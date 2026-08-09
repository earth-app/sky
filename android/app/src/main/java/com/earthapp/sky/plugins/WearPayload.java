package com.earthapp.sky.plugins;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;

/**
 * Builds the JSON payload the phone sends over the Wearable Data Layer.
 *
 * <p>Separate from {@link WearNotificationBridgePlugin} so the shape - which the watch's
 * {@code WearableListenerService} parses by key - is testable without Play Services or a device.</p>
 */
public final class WearPayload {

    /** the data-layer path the watch listener subscribes to; renaming it silently drops delivery */
    public static final String NOTIFICATION_PATH = "/notification/deliver";

    public static final String DEFAULT_TYPE = "info";
    public static final String DEFAULT_SOURCE = "system";

    private WearPayload() {}

    /**
     * @param nowSeconds fallback for a missing {@code createdAt}, in unix seconds
     */
    public static JSObject build(
        String id,
        String title,
        String body,
        String type,
        String source,
        String link,
        Long createdAt,
        long nowSeconds
    ) {
        JSObject payload = new JSObject();
        payload.put("id", nonNull(id, ""));
        payload.put("title", nonNull(title, ""));
        payload.put("body", nonNull(body, ""));
        payload.put("type", nonNull(type, DEFAULT_TYPE));
        payload.put("source", nonNull(source, DEFAULT_SOURCE));
        payload.put("link", nonNull(link, ""));
        payload.put("createdAt", createdAt != null ? createdAt : nowSeconds);
        return payload;
    }

    public static byte[] encode(JSObject payload) {
        return payload.toString().getBytes(StandardCharsets.UTF_8);
    }

    static String nonNull(String s, String fallback) {
        return (s == null || s.isEmpty()) ? fallback : s;
    }
}
