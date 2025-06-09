import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.KotlinMultiplatformExtension

plugins {
    kotlin("multiplatform") version "2.1.21" apply false
    kotlin("plugin.compose") version "2.1.21" apply false
    id("org.jetbrains.compose") version "1.8.1" apply false
    id("com.android.application") version "8.10.1" apply false
    id("com.android.library") version "8.10.1" apply false
}

allprojects {
    group = "com.earth-app"
    version = "1.0.0"

    repositories {
        mavenLocal()
        mavenCentral()
        google()

        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
        maven("https://packages.jetbrains.team/maven/p/kpm/public/")
    }
}

subprojects {
    plugins.withId("org.jetbrains.kotlin.multiplatform") {
        plugins.withId("org.jetbrains.compose") {
            extensions.configure<KotlinMultiplatformExtension> {
                configureSourceSets()
                applyDefaultHierarchyTemplate()
            }
        }
    }
}

fun KotlinMultiplatformExtension.configureSourceSets() {
    sourceSets
        .matching { it.name !in listOf("main", "test") }
        .all {
            val srcDir = when {
                "Test" in name -> "test"
                "Debug" in name -> "debug"
                "Release" in name -> "release"
                else -> "main"
            }
            val resourcesPrefix = when {
                name.endsWith("Test") -> "test-"
                name.endsWith("Debug") -> "debug-"
                name.endsWith("Release") -> "release-"
                else -> ""
            }

            val platform = when {
                (name.endsWith("Main") || name.endsWith("Test")) -> name.dropLast(4)
                else -> name.substringBefore(name.first { it.isUpperCase() })
            }

            kotlin.srcDir("src/$platform/$srcDir")
            resources.srcDir("src/$platform/${resourcesPrefix}resources")

            languageSettings.apply {
                progressiveMode = true
            }
        }
}