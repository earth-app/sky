package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * The permission and bridge contracts behind photo capture and audio recording.
 *
 * <p>Real capture cannot happen here and is deliberately not simulated: there is no camera and no
 * microphone behind a JVM test, and a fake that returned bytes would assert nothing about the
 * device. What IS decidable off-device is everything around the capture - whether the alias the app
 * asks for exists, whether that alias is backed by a permission the manifest declares, and whether
 * the methods the web layer calls exist on the plugin at all. Each of those fails only at runtime
 * otherwise, and two of them fail SILENTLY.</p>
 *
 * <p>The loudest of the silent ones: {@code CameraPlugin.getPermissionStates()} reports
 * {@code camera} as GRANTED whenever CAMERA is undeclared, so losing that one manifest line turns
 * every permission check into a yes and moves the failure to the capture itself.</p>
 */
@RunWith(RobolectricTestRunner.class)
public class MediaCaptureTest {

    private static final String CAMERA_PLUGIN = "com.capacitorjs.plugins.camera.CameraPlugin";
    private static final String AUDIO_PLUGIN = "app.capgo.audiorecorder.CapacitorAudioRecorderPlugin";

    private static final String PERMISSIONS_TS = "src/composables/useQuestPermissions.ts";
    private static final String AUDIO_TS = "src/composables/useAudioRecorder.ts";
    private static final String AUDIO_PLUGIN_SOURCE =
        "node_modules/@capgo/capacitor-audio-recorder/android/src/main/java/app/capgo/audiorecorder/CapacitorAudioRecorderPlugin.java";
    private static final String WEBVIEW_BRIDGE_SOURCE =
        "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java";

    /** the api level from which the system gallery picker needs no storage permission at all */
    private static final int PICKER_IS_PERMISSION_FREE_FROM = Build.VERSION_CODES.Q;

    // #region aliases

    // a mistyped alias is not an error: Capacitor requests nothing for it and the plugin answers with
    // whatever state the remaining aliases have, so `permissions: ['Camera']` would read as granted
    @Test
    public void theAppOnlyRequestsCameraAliasesThePluginDeclares() {
        Set<String> declared = aliases(CAMERA_PLUGIN);
        Set<String> requested = RepoFiles.matchAllUnique(
            RepoFiles.read(PERMISSIONS_TS),
            "Camera\\.requestPermissions\\(\\{\\s*permissions:\\s*\\['([^']+)'"
        );
        assertFalse("no Camera.requestPermissions call found in " + PERMISSIONS_TS, requested.isEmpty());
        for (String alias : requested) {
            assertTrue(
                "the app requests the camera alias '" + alias + "' but the plugin declares " + declared,
                declared.contains(alias)
            );
        }
    }

    // the answer is keyed by alias too, so reading `current.notAnAlias` is undefined, not 'denied'
    @Test
    public void theAppOnlyReadsCameraPermissionKeysThePluginReturns() {
        Set<String> declared = aliases(CAMERA_PLUGIN);
        Set<String> read = RepoFiles.matchAllUnique(
            functionBody(RepoFiles.read(PERMISSIONS_TS), "async function ensureCamera"),
            "(?:current|req)\\.(\\w+) === 'granted'"
        );
        assertFalse("no camera permission-state read found in ensureCamera", read.isEmpty());
        for (String key : read) {
            assertTrue(
                "the app reads permission key '" + key + "' but the plugin returns " + declared,
                declared.contains(key)
            );
        }
    }

    @Test
    public void theCameraAliasIsBackedByADeclaredManifestPermission() {
        Set<String> backing = permissionsFor(CAMERA_PLUGIN, "camera");
        assertEquals(
            "the camera alias no longer maps to CAMERA",
            new LinkedHashSet<>(Arrays.asList("android.permission.CAMERA")),
            backing
        );
        assertTrue(
            "CAMERA is undeclared, so CameraPlugin.getPermissionStates() self-grants it",
            mergedPermissions().containsAll(backing)
        );
    }

    @Test
    public void theMicrophoneAliasIsBackedByADeclaredManifestPermission() {
        Set<String> backing = permissionsFor(AUDIO_PLUGIN, "microphone");
        assertEquals(
            "the microphone alias no longer maps to RECORD_AUDIO",
            new LinkedHashSet<>(Arrays.asList("android.permission.RECORD_AUDIO")),
            backing
        );
        assertTrue(
            "RECORD_AUDIO is undeclared, so requestPermissionForAlias('microphone') can only deny",
            mergedPermissions().containsAll(backing)
        );
    }

    // #endregion

    // #region the gallery picker

    // android's photo picker is permission-free from api 29 up, so there is no media permission to
    // revoke and no dialog to refuse. declaring one anyway costs a Play policy declaration and buys
    // nothing, which is why the absence is asserted rather than assumed
    @Test
    public void theGalleryPickerAsksForNoMediaPermission() {
        Set<String> merged = mergedPermissions();
        for (String permission : new String[] {
            "android.permission.READ_MEDIA_IMAGES",
            "android.permission.READ_MEDIA_VIDEO",
            "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
        }) {
            assertFalse(
                permission + " is declared but the picker never needs it; drop it or justify it to Play",
                merged.contains(permission)
            );
        }
    }

    // the picker alias carries no permission strings at all, and CameraPlugin forces it to GRANTED
    // unconditionally - so any app-side gate on `photos` is a gate that can never close
    @Test
    public void thePhotosAliasCarriesNoPermissionAtAll() {
        assertTrue(
            "the photos alias gained a permission; the picker gate is no longer unconditional",
            permissionsFor(CAMERA_PLUGIN, "photos").isEmpty()
        );
    }

    // the legacy storage pair is NOT dead weight while minSdk is below Q: IonCameraFlow gates
    // chooseFromGallery on the saveGallery alias there. once minSdk reaches Q they must go
    @Test
    public void theLegacyStoragePermissionsTrackTheMinSdkThatStillNeedsThem() {
        int minSdk = minSdkVersion();
        Set<String> merged = mergedPermissions();
        Set<String> saveGallery = permissionsFor(CAMERA_PLUGIN, "saveGallery");

        if (minSdk < PICKER_IS_PERMISSION_FREE_FROM) {
            for (String permission : saveGallery) {
                assertTrue(
                    "minSdk " + minSdk + " still reaches the pre-Q gallery path, which needs " + permission,
                    merged.contains(permission)
                );
            }
        } else {
            for (String permission : saveGallery) {
                assertFalse(
                    permission + " is dead at minSdk " + minSdk + "; the picker needs no storage from Q",
                    merged.contains(permission)
                );
            }
        }
    }

    // #endregion

    // #region bridge method contracts

    @Test
    public void everyCameraMethodTheAppCallsExistsOnThePlugin() {
        assertBridgeMethodsExist("Camera", CAMERA_PLUGIN, new String[] { PERMISSIONS_TS });
    }

    @Test
    public void everyRecorderMethodTheAppCallsExistsOnThePlugin() {
        assertBridgeMethodsExist("CapacitorAudioRecorder", AUDIO_PLUGIN, new String[] { AUDIO_TS });
    }

    // #endregion

    // #region capture output

    // the recorder's container is a cross-repo contract: cloud sniffs the uploaded bytes to pick a
    // transcription decoder, and MRecord labels the upload from this same assumption. a dependency
    // bump that swapped MPEG_4 for THREE_GPP would break it with a 415 and no local signal
    @Test
    public void theRecorderStillProducesTheContainerTheUploadDeclares() {
        String plugin = RepoFiles.read(AUDIO_PLUGIN_SOURCE);
        assertTrue(
            "the recorder no longer writes an MPEG-4 container",
            plugin.contains("MediaRecorder.OutputFormat.MPEG_4")
        );
        assertTrue(
            "the recorder no longer encodes AAC",
            plugin.contains("MediaRecorder.AudioEncoder.AAC")
        );
        assertTrue("the recorder no longer names its file .m4a", plugin.contains("\".m4a\""));

        String upload = RepoFiles.read(AUDIO_TS);
        assertTrue(
            AUDIO_TS + " no longer labels the upload audio/mp4, which is the MPEG-4 container",
            upload.contains("'audio/mp4'")
        );
        assertTrue(AUDIO_TS + " no longer falls back to a .m4a filename", upload.contains(".m4a"));
    }

    // #endregion

    // #region the webview capture bridge

    // getUserMedia inside the webview does not go through a plugin at all: Capacitor's
    // BridgeWebChromeClient translates the requested resource into android permissions itself, then
    // grants the web request only if EVERY one of them came back granted. so each permission it names
    // has to be declared, or the AND can never be true
    @Test
    public void theCameraPermissionTheWebviewCaptureBridgeRequestsIsDeclared() {
        Set<String> requested = webviewCapturePermissions("VIDEO_CAPTURE");
        assertEquals(
            "Capacitor changed which permissions it requests for webview video capture",
            new LinkedHashSet<>(Arrays.asList("android.permission.CAMERA")),
            requested
        );
        assertTrue(
            "the webview would deny every getUserMedia video request",
            mergedPermissions().containsAll(requested)
        );
    }

    // #endregion

    // #region helpers

    /** one function out of a composable, so a sibling function's identifiers cannot be swept in */
    private static String functionBody(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue("no '" + signature + "' in the source", start >= 0);
        int end = source.indexOf("\n\t}", start);
        assertTrue("unterminated '" + signature + "'", end > start);
        return source.substring(start, end);
    }

    private static void assertBridgeMethodsExist(String jsName, String pluginClass, String[] callSites) {
        Set<String> exposed = pluginMethodNames(pluginClass);
        Set<String> called = new LinkedHashSet<>();
        for (String file : callSites) {
            called.addAll(RepoFiles.matchAllUnique(RepoFiles.read(file), jsName + "\\.(\\w+)\\("));
        }
        assertFalse("no " + jsName + ".<method>() call sites found in " + Arrays.toString(callSites), called.isEmpty());
        for (String method : called) {
            assertTrue(
                "the app calls " + jsName + "." + method + "() but the plugin exposes " + exposed,
                exposed.contains(method)
            );
        }
    }

    /** the permissions Capacitor's own WebChromeClient maps a webview capture resource onto */
    private static Set<String> webviewCapturePermissions(String resource) {
        String source = RepoFiles.read(WEBVIEW_BRIDGE_SOURCE);
        int start = source.indexOf("android.webkit.resource." + resource);
        assertTrue(
            "BridgeWebChromeClient no longer handles " + resource + "; re-read its onPermissionRequest",
            start >= 0
        );
        int end = source.indexOf("}", start);
        assertTrue("unterminated " + resource + " branch", end > start);

        Set<String> permissions = new LinkedHashSet<>();
        for (String name : RepoFiles.matchAll(source.substring(start, end), "Manifest\\.permission\\.(\\w+)")) {
            permissions.add("android.permission." + name);
        }
        assertFalse("the " + resource + " branch names no permissions", permissions.isEmpty());
        return permissions;
    }

    private static Set<String> aliases(String pluginClass) {
        Set<String> found = new LinkedHashSet<>();
        for (Permission permission : capacitorPlugin(pluginClass).permissions()) {
            found.add(permission.alias());
        }
        assertFalse(pluginClass + " declares no permission aliases", found.isEmpty());
        return found;
    }

    private static Set<String> permissionsFor(String pluginClass, String alias) {
        for (Permission permission : capacitorPlugin(pluginClass).permissions()) {
            if (alias.equals(permission.alias())) {
                return new LinkedHashSet<>(Arrays.asList(permission.strings()));
            }
        }
        fail(pluginClass + " no longer declares the '" + alias + "' alias");
        return null;
    }

    private static CapacitorPlugin capacitorPlugin(String pluginClass) {
        CapacitorPlugin annotation = load(pluginClass).getAnnotation(CapacitorPlugin.class);
        assertNotNull(pluginClass + " carries no @CapacitorPlugin", annotation);
        return annotation;
    }

    private static Set<String> pluginMethodNames(String pluginClass) {
        Set<String> names = new LinkedHashSet<>();
        for (Method method : load(pluginClass).getDeclaredMethods()) {
            if (method.getAnnotation(PluginMethod.class) != null) names.add(method.getName());
        }
        // inherited ones count too: the recorder overrides removeAllListeners from Plugin
        for (Method method : load(pluginClass).getMethods()) {
            if (method.getAnnotation(PluginMethod.class) != null) names.add(method.getName());
        }
        assertFalse(pluginClass + " exposes no @PluginMethod", names.isEmpty());
        return names;
    }

    private static Class<?> load(String className) {
        try {
            return Class.forName(className);
        } catch (ClassNotFoundException e) {
            fail(className + " is not on the classpath; the plugin was removed or renamed");
            return null;
        }
    }

    private static int minSdkVersion() {
        return ApplicationProvider
            .<Context>getApplicationContext()
            .getApplicationInfo()
            .minSdkVersion;
    }

    private static Set<String> mergedPermissions() {
        Context context = ApplicationProvider.getApplicationContext();
        try {
            PackageInfo info = context
                .getPackageManager()
                .getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
            String[] requested = info.requestedPermissions;
            return requested == null
                ? new LinkedHashSet<>()
                : new LinkedHashSet<>(Arrays.asList(requested));
        } catch (PackageManager.NameNotFoundException e) {
            throw new AssertionError(e);
        }
    }

    // #endregion
}
