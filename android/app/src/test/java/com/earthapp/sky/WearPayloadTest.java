package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.earthapp.sky.plugins.WearPayload;
import com.getcapacitor.JSObject;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.nio.charset.StandardCharsets;

/**
 * Robolectric is required, not optional: {@code JSObject extends org.json.JSONObject}, and
 * {@code org.json} comes from the stub {@code android.jar}, whose every method throws
 * {@code RuntimeException("Stub!")} outside Robolectric.
 */
@RunWith(RobolectricTestRunner.class)
public class WearPayloadTest {

    private static JSObject full() {
        return WearPayload.build("n1", "Title", "Body", "warning", "quest", "/tabs/quests/1", 1700L, 999L);
    }

    @Test
    public void carriesEveryFieldTheWatchListenerReads() {
        JSObject payload = full();
        assertEquals("n1", payload.getString("id"));
        assertEquals("Title", payload.getString("title"));
        assertEquals("Body", payload.getString("body"));
        assertEquals("warning", payload.getString("type"));
        assertEquals("quest", payload.getString("source"));
        assertEquals("/tabs/quests/1", payload.getString("link"));
        assertEquals(1700L, payload.optLong("createdAt"));
    }

    // the js side declares type/source/link/createdAt optional, so every one of them arrives null
    @Test
    public void substitutesDefaultsForTheOptionalFields() {
        JSObject payload = WearPayload.build("n1", "T", "B", null, null, null, null, 4242L);
        assertEquals(WearPayload.DEFAULT_TYPE, payload.getString("type"));
        assertEquals(WearPayload.DEFAULT_SOURCE, payload.getString("source"));
        assertEquals("", payload.getString("link"));
        assertEquals(4242L, payload.optLong("createdAt"));
    }

    // an empty string is as useless to the watch ui as a null one
    @Test
    public void treatsEmptyStringsAsAbsent() {
        JSObject payload = WearPayload.build("", "", "", "", "", "", null, 1L);
        assertEquals("", payload.getString("id"));
        assertEquals(WearPayload.DEFAULT_TYPE, payload.getString("type"));
        assertEquals(WearPayload.DEFAULT_SOURCE, payload.getString("source"));
    }

    @Test
    public void neverEmitsAnUndefinedKey() {
        JSObject payload = WearPayload.build(null, null, null, null, null, null, null, 1L);
        for (String key : new String[] { "id", "title", "body", "type", "source", "link", "createdAt" }) {
            assertTrue("missing key " + key, payload.has(key));
            assertFalse("null value for " + key, payload.isNull(key));
        }
    }

    @Test
    public void keepsAnExplicitZeroCreatedAt() {
        assertEquals(0L, WearPayload.build("n", "t", "b", null, null, null, 0L, 555L).optLong("createdAt"));
    }

    @Test
    public void encodesAsUtf8Json() {
        JSObject payload = WearPayload.build("n", "Bäume 🌲", "b", null, null, null, 1L, 1L);
        byte[] bytes = WearPayload.encode(payload);
        String decoded = new String(bytes, StandardCharsets.UTF_8);
        assertTrue(decoded.startsWith("{"));
        assertEquals(payload.toString(), decoded);
    }

    // literals, not the constants, because the watch's WearableListenerService parses these strings
    // and a rename drops delivery silently - sendMessage still succeeds. asserting a constant
    // against itself would pass through any rename
    @Test
    public void pinsTheWireLiterals() {
        assertEquals("/notification/deliver", WearPayload.NOTIFICATION_PATH);
        assertEquals("info", WearPayload.DEFAULT_TYPE);
        assertEquals("system", WearPayload.DEFAULT_SOURCE);
    }
}
