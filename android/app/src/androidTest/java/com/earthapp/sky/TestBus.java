package com.earthapp.sky;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The observation bus: the app posts breadcrumbs to the mock backend and the test reads them back.
 *
 * <p>Assertions land on structured JSON rather than on a flattened accessibility string, so none of
 * the selector traps (text-node folding, required-marker concatenation, a modal owning the whole
 * tree, shadow DOM) can apply, and a breadcrumb still arrives while the app is mid-splash or behind
 * a system dialog.</p>
 *
 * <p>Optional by design. The routes live in the mock server, not in this module, so every caller
 * treats an unreachable bus as "no extra evidence" rather than as a failure - the native assertions
 * alongside it stand on their own.</p>
 */
final class TestBus {

    private static final String TAG = "TestBus";

    /** the emulator reaches the host loopback here; the port matches .config/native-android.env */
    private static final String BASE = "http://10.0.2.2:8788/__test__";

    private TestBus() {}

    /**
     * Whether the mock server actually implements the bus.
     *
     * <p>A bare "did it answer" probe is not enough: the mock has a catch-all that answers 200 for
     * unknown paths, so reachability has to be judged from the body being bus-shaped - a JSON array,
     * or an object carrying an {@code events} key.</p>
     */
    static boolean isReachable() {
        try {
            String body = get("/events?since=0");
            if (body == null) return false;
            String trimmed = body.trim();
            return trimmed.startsWith("[") || trimmed.contains("\"events\"");
        } catch (Exception e) {
            return false;
        }
    }

    static void reset() {
        try {
            post("/reset");
        } catch (Exception e) {
            Log.i(TAG, "no observation bus to reset: " + e.getMessage());
        }
    }

    /** every {@code name} recorded so far, oldest first; empty when the bus is unreachable */
    static List<String> eventNames() {
        List<String> names = new ArrayList<>();
        String body;
        try {
            body = get("/events?since=0");
        } catch (Exception e) {
            return names;
        }
        if (body == null) return names;
        Matcher matcher = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"").matcher(body);
        while (matcher.find()) names.add(matcher.group(1));
        return names;
    }

    /** waits for a named breadcrumb; false when it never arrives OR the bus is unreachable */
    static boolean await(String name, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (eventNames().contains(name)) return true;
            AppUnderTest.sleep(500);
        }
        return false;
    }

    private static String get(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
        connection.setConnectTimeout(2000);
        connection.setReadTimeout(4000);
        try {
            if (connection.getResponseCode() >= 400) return null;
            try (InputStream in = connection.getInputStream()) {
                return readAll(in);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static void post(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setConnectTimeout(2000);
        connection.setReadTimeout(4000);
        try (OutputStream out = connection.getOutputStream()) {
            out.write("{}".getBytes(StandardCharsets.UTF_8));
        }
        connection.getResponseCode();
        connection.disconnect();
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read);
        return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    }
}
