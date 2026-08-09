package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.w3c.dom.Element;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The deep-link contract spans three files that no single toolchain checks together: the manifest
 * declares what Android will hand to the app, {@code useDeepLinkRouting.ts} decides what the app
 * does with it, and {@code strings.xml} carries the scheme Capacitor echoes back on OAuth.
 *
 * <p>A path added on one side only silently drops the link on the floor: Android opens a browser
 * instead of the app, or the app receives a URL it maps to {@code ignore}.</p>
 */
public class DeepLinkContractTest {

    private static final String ROUTING_TS = "src/composables/useDeepLinkRouting.ts";
    private static final String SCHEME = "com.earthapp.sky";
    private static final String APP_LINK_HOST = "app.earth-app.com";

    private static Element mainActivity() {
        return AndroidManifestXml.activity(".MainActivity");
    }

    private static List<Element> intentFilters() {
        return AndroidManifestXml.children(mainActivity(), "intent-filter");
    }

    private static Element filterWithScheme(String scheme) {
        for (Element filter : intentFilters()) {
            if (AndroidManifestXml.attrs(filter, "data", "scheme").contains(scheme)) return filter;
        }
        throw new AssertionError("no <intent-filter> declaring android:scheme=\"" + scheme + "\"");
    }

    @Test
    public void declaresTheCustomSchemeTheOauthFallbackUses() {
        Element filter = filterWithScheme(SCHEME);
        assertTrue(
            "custom-scheme filter must accept ACTION_VIEW",
            AndroidManifestXml.attrs(filter, "action", "name").contains("android.intent.action.VIEW")
        );
        Set<String> categories = AndroidManifestXml.attrs(filter, "category", "name");
        assertTrue(categories.contains("android.intent.category.DEFAULT"));
        assertTrue(
            "without BROWSABLE the os will not hand a link from a browser to the app",
            categories.contains("android.intent.category.BROWSABLE")
        );
    }

    // capacitor reads custom_url_scheme when it builds the oauth redirect, so the two must agree
    @Test
    public void theCustomSchemeMatchesStringsXmlAndTheRouter() {
        assertTrue(RepoFiles.read("android/app/src/main/res/values/strings.xml")
            .contains("<string name=\"custom_url_scheme\">" + SCHEME + "</string>"));
        assertTrue(
            "useDeepLinkRouting no longer recognises " + SCHEME + ":",
            RepoFiles.read(ROUTING_TS).contains("'" + SCHEME + ":'")
        );
    }

    @Test
    public void declaresTheAppLinkHostTheRouterAllows() {
        Element filter = filterWithScheme("https");
        assertEquals(
            java.util.Collections.singleton(APP_LINK_HOST),
            AndroidManifestXml.attrs(filter, "data", "host")
        );
        assertTrue(
            "useDeepLinkRouting no longer allows " + APP_LINK_HOST,
            RepoFiles.read(ROUTING_TS).contains("'" + APP_LINK_HOST + "'")
        );
    }

    // without autoVerify android shows a disambiguation chooser instead of opening the app, which
    // strands the oauth round trip in a browser tab
    @Test
    public void theAppLinkFilterIsAutoVerified() {
        assertEquals("true", AndroidManifestXml.attr(filterWithScheme("https"), "autoVerify"));
    }

    // the manifest's pathPrefixes are the only paths the os will route inward; OAUTH_COMPLETE_PATHS
    // is the set the router recognises once it has them. a path in one and not the other is dead
    @Test
    public void theOauthPathPrefixesMatchTheRouterExactly() {
        Set<String> manifestPaths = AndroidManifestXml.attrs(filterWithScheme("https"), "data", "pathPrefix");
        Set<String> routerPaths = oauthCompletePaths();
        assertFalse("no OAUTH_COMPLETE_PATHS found in " + ROUTING_TS, routerPaths.isEmpty());
        assertEquals(
            "AndroidManifest pathPrefixes and OAUTH_COMPLETE_PATHS have diverged",
            routerPaths,
            manifestPaths
        );
    }

    @Test
    public void everyOauthPathIsAbsolute() {
        for (String path : AndroidManifestXml.attrs(filterWithScheme("https"), "data", "pathPrefix")) {
            assertTrue(path + " must start with /", path.startsWith("/"));
        }
    }

    // singleTask is what routes a link into onNewIntent on an already-running app instead of
    // stacking a second MainActivity with its own webview and its own auth state
    @Test
    public void mainActivityIsSingleTaskAndExported() {
        assertEquals("singleTask", AndroidManifestXml.attr(mainActivity(), "launchMode"));
        assertEquals("true", AndroidManifestXml.attr(mainActivity(), "exported"));
    }

    // a config change that is not listed restarts the activity, which tears the webview down and
    // loses the in-flight oauth state; uiMode and screenSize are the two that fire in normal use
    @Test
    public void mainActivityHandlesTheConfigChangesThatWouldRecreateTheWebview() {
        String declared = AndroidManifestXml.attr(mainActivity(), "configChanges");
        for (String change : new String[] { "orientation", "screenSize", "uiMode", "keyboardHidden" }) {
            assertTrue("configChanges is missing " + change, declared.contains(change));
        }
    }

    private static Set<String> oauthCompletePaths() {
        String ts = RepoFiles.read(ROUTING_TS);
        int start = ts.indexOf("OAUTH_COMPLETE_PATHS");
        assertTrue("no OAUTH_COMPLETE_PATHS in " + ROUTING_TS, start >= 0);
        int end = ts.indexOf("]", start);
        assertTrue("unterminated OAUTH_COMPLETE_PATHS", end > start);
        return new LinkedHashSet<>(RepoFiles.matchAll(ts.substring(start, end), "'(/[^']*)'"));
    }
}
