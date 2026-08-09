package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.w3c.dom.Element;

/**
 * Nothing on the native side clears the splash. {@code capacitor.config.ts} sets
 * {@code launchAutoHide: false}, so the only thing that ever hides it is a
 * {@code SplashScreen.hide()} call from the web layer - and if that call is removed, refactored out
 * of the boot path, or never reached because boot threw, the app launches to a permanent splash.
 *
 * <p>That has shipped. The static half of the guard is here; the timed half is the cold-launch case
 * in {@code androidTest/ColdLaunchTest}.</p>
 */
public class SplashContractTest {

    private static final String CONFIG = "capacitor.config.ts";
    private static final String ENTRY_PAGE = "src/pages/index.vue";

    private static boolean launchAutoHide() {
        String config = RepoFiles.read(CONFIG);
        return RepoFiles
            .matchAll(config, "launchAutoHide:\\s*(true|false)")
            .stream()
            .findFirst()
            .map(Boolean::parseBoolean)
            .orElseThrow(() -> new AssertionError("no launchAutoHide in " + CONFIG));
    }

    @Test
    public void anAppThatNeverAutoHidesMustHideTheSplashItself() {
        if (launchAutoHide()) return; // the plugin clears it on a timer; nothing to prove
        String entry = RepoFiles.read(ENTRY_PAGE);
        assertTrue(
            ENTRY_PAGE + " no longer imports SplashScreen, so launchAutoHide:false strands the splash",
            entry.contains("from '@capacitor/splash-screen'")
        );
        assertTrue(
            ENTRY_PAGE + " never calls SplashScreen.hide()",
            entry.contains("SplashScreen.hide()")
        );
    }

    // every early return out of the boot handler needs its own hide(); one that slips through is a
    // launch that hangs on the splash for exactly the users who took that branch
    @Test
    public void everyBootBranchHidesTheSplash() {
        if (launchAutoHide()) return;
        String entry = RepoFiles.read(ENTRY_PAGE);
        int start = entry.indexOf("onMounted(async () => {");
        assertTrue("no onMounted boot handler in " + ENTRY_PAGE, start >= 0);
        int end = entry.indexOf("\n});", start);
        assertTrue("unterminated onMounted boot handler", end > start);
        String body = entry.substring(start, end);

        int returns = RepoFiles.matchAll(body, "(\\breturn\\b);").size();
        int hides = RepoFiles.matchAll(body, "(SplashScreen\\.hide)\\(\\)").size();
        assertTrue(
            "the boot handler has " + returns + " early return(s) but only " + hides + " hide() call(s)",
            hides > returns
        );
    }

    // Theme.SplashScreen comes from androidx core-splashscreen; any other parent brings an action
    // bar back for the first frame
    @Test
    public void theLaunchThemeUsesTheAndroidxSplashParent() {
        Element theme = launchTheme();
        assertEquals("Theme.SplashScreen", theme.getAttribute("parent"));
        assertTrue(
            "androidx.core:core-splashscreen must stay on the classpath for Theme.SplashScreen",
            RepoFiles.read("android/app/build.gradle").contains("androidx.core:core-splashscreen")
        );
    }

    @Test
    public void theLaunchThemePaintsTheSplashDrawable() {
        Element theme = launchTheme();
        for (Element item : AndroidManifestXml.children(theme, "item")) {
            if ("android:background".equals(item.getAttribute("name"))) {
                assertEquals("@drawable/splash", item.getTextContent().trim());
                return;
            }
        }
        throw new AssertionError("AppTheme.NoActionBarLaunch declares no android:background");
    }

    @Test
    public void theManifestPointsMainActivityAtTheLaunchTheme() {
        assertEquals(
            "@style/AppTheme.NoActionBarLaunch",
            AndroidManifestXml.attr(AndroidManifestXml.activity(".MainActivity"), "theme")
        );
    }

    private static Element launchTheme() {
        for (Element style : AndroidManifestXml.elements(styles(), "style")) {
            if ("AppTheme.NoActionBarLaunch".equals(style.getAttribute("name"))) return style;
        }
        throw new AssertionError("no <style name=\"AppTheme.NoActionBarLaunch\"> in styles.xml");
    }

    private static Element styles() {
        try {
            javax.xml.parsers.DocumentBuilderFactory factory =
                javax.xml.parsers.DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory
                .newDocumentBuilder()
                .parse(new java.io.File(RepoFiles.root(), "android/app/src/main/res/values/styles.xml"))
                .getDocumentElement();
        } catch (Exception e) {
            throw new AssertionError("could not parse styles.xml: " + e);
        }
    }
}
