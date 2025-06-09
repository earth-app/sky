plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
    id("com.android.application")
}

kotlin {
    androidTarget()

    sourceSets {
        androidMain.dependencies {
            api(project(":shared"))

            api("androidx.activity:activity-compose:1.10.1")
            api("androidx.appcompat:appcompat:1.7.1")
            api("androidx.core:core-ktx:1.16.0")
        }
    }
}

android {
    compileSdk = findProperty("android.targetSdk")?.toString()?.toInt() ?: 35
    namespace = "com.earthapp.sky.app"

    sourceSets["main"].manifest.srcFile("src/android/main/AndroidManifest.xml")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    defaultConfig {
        applicationId = "com.earthapp.sky"
        minSdk = findProperty("android.minSdk")?.toString()?.toInt() ?: 21
        targetSdk = findProperty("android.targetSdk")?.toString()?.toInt() ?: 35
        versionCode = 1
        versionName = version.toString()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }
}