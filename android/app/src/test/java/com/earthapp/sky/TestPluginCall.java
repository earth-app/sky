package com.earthapp.sky;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/**
 * A {@link PluginCall} that records its outcome instead of writing it back over the bridge.
 *
 * <p>The real call needs a {@code MessageHandler}, which needs a {@code Bridge}, which needs a
 * {@code WebView} - so driving a plugin's own code path from a JVM test means substituting the one
 * collaborator at the far end. Everything the plugin READS ({@code getString}, {@code getInt},
 * {@code getArray}, ...) is the real implementation over the real {@code JSObject}, so the argument
 * parsing under test is the shipped parsing.</p>
 */
final class TestPluginCall extends PluginCall {

    private boolean resolved;
    private JSObject result;
    private String rejection;

    TestPluginCall(JSObject data) {
        super(null, "test", "test-callback", "test", data);
    }

    @Override
    public void resolve() {
        resolved = true;
    }

    @Override
    public void resolve(JSObject data) {
        resolved = true;
        result = data;
    }

    // every reject(...) overload funnels through this one, so this is the only override needed
    @Override
    public void reject(String msg, String code, Exception ex, JSObject data) {
        rejection = msg;
    }

    String rejection() {
        return rejection;
    }

    JSObject result() {
        return result;
    }

    void assertResolved() {
        assertNull("expected a resolve but the plugin rejected with: " + rejection, rejection);
        org.junit.Assert.assertTrue("the plugin neither resolved nor rejected", resolved);
    }

    void assertRejected(String expectedMessage) {
        assertNotNull("expected a rejection but the plugin resolved", rejection);
        org.junit.Assert.assertEquals(expectedMessage, rejection);
    }
}
