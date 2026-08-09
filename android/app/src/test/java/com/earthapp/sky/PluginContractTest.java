package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.earthapp.sky.plugins.WearNotificationBridgePlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.junit.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The bridge is resolved by string at runtime, so renaming a plugin or a {@code @PluginMethod} keeps
 * every compiler and every web test green and 404s only on a real device. This is the guard.
 */
public class PluginContractTest {

    private static final String WEAR_JS = "src/composables/useWatchNotifications.ts";

    @Test
    public void mainActivityRegistersEveryLocalPlugin() {
        assertTrue(
            "WearNotificationBridgePlugin is not in MainActivity.LOCAL_PLUGINS, so the bridge never sees it",
            MainActivity.LOCAL_PLUGINS.contains(WearNotificationBridgePlugin.class)
        );
        for (Class<? extends Plugin> plugin : MainActivity.LOCAL_PLUGINS) {
            assertNotNull(
                plugin.getName() + " is registered but carries no @CapacitorPlugin",
                plugin.getAnnotation(CapacitorPlugin.class)
            );
        }
    }

    // every local plugin class under com.earthapp.sky.plugins must be registered; adding a class and
    // forgetting the registerPlugin call is the other half of the same failure
    @Test
    public void everyLocalPluginClassIsRegistered() {
        Set<Class<? extends Plugin>> declared = new LinkedHashSet<>();
        for (String name : RepoFiles.matchAllUnique(
            listPluginSources(),
            "public class (\\w+) extends Plugin"
        )) {
            try {
                declared.add(Class.forName("com.earthapp.sky.plugins." + name).asSubclass(Plugin.class));
            } catch (ClassNotFoundException e) {
                fail("com.earthapp.sky.plugins." + name + " is on disk but not on the test classpath");
            }
        }
        assertFalse("found no local plugin sources at all", declared.isEmpty());
        for (Class<? extends Plugin> plugin : declared) {
            assertTrue(
                plugin.getSimpleName() + " is never passed to registerPlugin in MainActivity",
                MainActivity.LOCAL_PLUGINS.contains(plugin)
            );
        }
    }

    @Test
    public void wearPluginNameMatchesTheRegisterPluginCallInTypescript() {
        String declared = WearNotificationBridgePlugin.class.getAnnotation(CapacitorPlugin.class).name();
        assertEquals("WearNotificationBridge", declared);

        Set<String> jsNames = RepoFiles.matchAllUnique(
            RepoFiles.read(WEAR_JS),
            "registerPlugin<[^>]+>\\(\\s*'([^']+)'"
        );
        assertTrue(
            "no registerPlugin('" + declared + "') in " + WEAR_JS + "; found " + jsNames,
            jsNames.contains(declared)
        );
    }

    // the method names are the wire format. `WearBridge.isAvailable()` in ts has to find
    // `@PluginMethod public void isAvailable(PluginCall)` in java or it rejects at runtime
    @Test
    public void everyMethodTypescriptCallsExistsAsAPluginMethod() {
        Set<String> exposed = pluginMethodNames(WearNotificationBridgePlugin.class);
        String ts = RepoFiles.read(WEAR_JS);
        Set<String> called = RepoFiles.matchAllUnique(ts, "WearBridge\\.(\\w+)\\(");
        assertFalse("no WearBridge.<method>() call sites found in " + WEAR_JS, called.isEmpty());
        for (String name : called) {
            assertTrue(
                "typescript calls WearBridge." + name + "() but the plugin exposes " + exposed,
                exposed.contains(name)
            );
        }
        // and the interface the ts side declares must not promise a method java does not have
        for (String name : RepoFiles.matchAllUnique(interfaceBody(ts), "(?m)^\\t(\\w+)\\(")) {
            assertTrue(
                "the ts interface declares " + name + "() but the plugin exposes " + exposed,
                exposed.contains(name)
            );
        }
    }

    @Test
    public void pluginMethodsHaveTheSignatureTheBridgeInvokes() {
        for (Method method : WearNotificationBridgePlugin.class.getDeclaredMethods()) {
            if (method.getAnnotation(PluginMethod.class) == null) continue;
            assertTrue(method.getName() + " must be public", Modifier.isPublic(method.getModifiers()));
            assertFalse(method.getName() + " must not be static", Modifier.isStatic(method.getModifiers()));
            assertEquals(method.getName() + " must return void", void.class, method.getReturnType());
            assertEquals(
                method.getName() + " must take exactly one PluginCall",
                1,
                method.getParameterCount()
            );
            assertEquals(PluginCall.class, method.getParameterTypes()[0]);
        }
        assertEquals(2, pluginMethodNames(WearNotificationBridgePlugin.class).size());
    }

    // capacitor.plugins.json is generated by `cap sync` and gitignored, so it is only present on a
    // lane that synced. when it is there, every classpath in it has to load or the bridge fails at
    // boot with a ClassNotFoundException for a plugin the app still calls
    @Test
    public void syncedPluginClasspathsAllResolve() {
        String manifest = "android/app/src/main/assets/capacitor.plugins.json";
        if (!RepoFiles.exists(manifest)) return;
        // matched rather than parsed so this class stays off robolectric; org.json is a stub here
        List<String> classpaths = RepoFiles.matchAll(
            RepoFiles.read(manifest),
            "\"classpath\"\\s*:\\s*\"([^\"]+)\""
        );
        assertFalse("capacitor.plugins.json lists no plugins", classpaths.isEmpty());
        for (String classpath : classpaths) {
            try {
                Class<?> loaded = Class.forName(classpath, false, getClass().getClassLoader());
                assertNotNull(
                    classpath + " is registered but carries no @CapacitorPlugin",
                    loaded.getAnnotation(CapacitorPlugin.class)
                );
            } catch (ClassNotFoundException e) {
                fail(classpath + " is listed in capacitor.plugins.json but is not on the classpath");
            }
        }
    }

    private static String interfaceBody(String ts) {
        int start = ts.indexOf("interface WearNotificationBridgePlugin");
        assertTrue("no WearNotificationBridgePlugin interface in " + WEAR_JS, start >= 0);
        int end = ts.indexOf("\n}", start);
        assertTrue("unterminated WearNotificationBridgePlugin interface", end > start);
        return ts.substring(start, end);
    }

    private static Set<String> pluginMethodNames(Class<? extends Plugin> plugin) {
        Set<String> names = new LinkedHashSet<>();
        for (Method method : plugin.getDeclaredMethods()) {
            if (method.getAnnotation(PluginMethod.class) != null) names.add(method.getName());
        }
        return names;
    }

    private static String listPluginSources() {
        StringBuilder all = new StringBuilder();
        java.io.File dir = new java.io.File(
            RepoFiles.root(),
            "android/app/src/main/java/com/earthapp/sky/plugins"
        );
        java.io.File[] files = dir.listFiles((d, name) -> name.endsWith(".java"));
        assertNotNull("no local plugin source directory at " + dir, files);
        for (java.io.File file : files) {
            all.append(RepoFiles.read("android/app/src/main/java/com/earthapp/sky/plugins/" + file.getName()));
            all.append('\n');
        }
        return all.toString();
    }
}
