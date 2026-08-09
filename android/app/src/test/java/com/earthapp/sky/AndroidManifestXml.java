package com.earthapp.sky;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import javax.xml.parsers.DocumentBuilderFactory;

/** DOM access to the app's source {@code AndroidManifest.xml}. */
final class AndroidManifestXml {

    static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";
    static final String PATH = "android/app/src/main/AndroidManifest.xml";

    private static Document document;

    private AndroidManifestXml() {}

    static synchronized Document document() {
        if (document != null) return document;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            document = factory.newDocumentBuilder().parse(new File(RepoFiles.root(), PATH));
        } catch (Exception e) {
            fail("could not parse " + PATH + ": " + e);
        }
        return document;
    }

    static Element activity(String name) {
        for (Element element : elements(document().getDocumentElement(), "activity")) {
            if (name.equals(attr(element, "name"))) return element;
        }
        fail("no <activity android:name=\"" + name + "\"> in " + PATH);
        return null;
    }

    /** every descendant element with the given tag name */
    static List<Element> elements(Element root, String tag) {
        List<Element> out = new ArrayList<>();
        NodeList nodes = root.getElementsByTagName(tag);
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (node instanceof Element) out.add((Element) node);
        }
        return out;
    }

    /** direct children only, so a nested <intent-filter> cannot be mistaken for a sibling */
    static List<Element> children(Element parent, String tag) {
        List<Element> out = new ArrayList<>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (node instanceof Element && tag.equals(node.getNodeName())) out.add((Element) node);
        }
        return out;
    }

    static String attr(Element element, String name) {
        assertNotNull(element);
        String value = element.getAttributeNS(ANDROID_NS, name);
        return value == null || value.isEmpty() ? null : value;
    }

    /** the values of one android:* attribute across every child of the given tag */
    static Set<String> attrs(Element parent, String tag, String attribute) {
        Set<String> out = new LinkedHashSet<>();
        for (Element element : children(parent, tag)) {
            String value = attr(element, attribute);
            if (value != null) out.add(value);
        }
        return out;
    }

    static Set<String> requestedPermissions() {
        Set<String> out = new LinkedHashSet<>();
        for (Element element : elements(document().getDocumentElement(), "uses-permission")) {
            String name = attr(element, "name");
            if (name != null) out.add(name);
        }
        return out;
    }
}
