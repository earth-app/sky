package com.earthapp.sky;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads files from the sky repository so a JVM test can assert a contract that spans the native and
 * the web halves of the app.
 *
 * <p>This is the only channel that can catch a rename on one side of the Capacitor bridge: the
 * TypeScript compiler never sees {@code AndroidManifest.xml} and gradle never sees {@code src/}.</p>
 */
final class RepoFiles {

    private static File root;

    private RepoFiles() {}

    /** the sky checkout root, found by walking up from the gradle module directory */
    static synchronized File root() {
        if (root != null) return root;
        File dir = new File(".").getAbsoluteFile();
        while (dir != null) {
            if (new File(dir, "package.json").isFile() && new File(dir, "capacitor.config.ts").isFile()) {
                root = dir;
                return root;
            }
            dir = dir.getParentFile();
        }
        fail("could not locate the sky repo root above " + new File(".").getAbsolutePath());
        return null;
    }

    static String read(String relativePath) {
        File file = new File(root(), relativePath);
        assertTrue("missing " + relativePath + " at " + file.getAbsolutePath(), file.isFile());
        try {
            return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        } catch (IOException e) {
            fail("could not read " + relativePath + ": " + e.getMessage());
            return "";
        }
    }

    static boolean exists(String relativePath) {
        return new File(root(), relativePath).isFile();
    }

    /** every capture group 1 match, in source order */
    static List<String> matchAll(String source, String regex) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile(regex).matcher(source);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    static Set<String> matchAllUnique(String source, String regex) {
        return new LinkedHashSet<>(matchAll(source, regex));
    }
}
