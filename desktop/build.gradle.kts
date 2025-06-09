import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.KotlinMultiplatformExtension

plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
}

kotlin {
    jvm()

    sourceSets {
        jvmMain.dependencies {
            implementation(project(":shared"))
            implementation(compose.desktop.currentOs)
        }
    }
}

compose {
    desktop {
        application {
            mainClass = "com.earthapp.sky.Sky"

            nativeDistributions {
                packageName = project.ext["app.packageName"] as String
                packageVersion = version.toString()

                targetFormats(
                    TargetFormat.Exe,
                    TargetFormat.Msi,
                    TargetFormat.Dmg,
                    TargetFormat.Pkg,
                    TargetFormat.Deb,
                    TargetFormat.Rpm,
                )

                windows {
                    iconFile.set(rootProject.file("shared/src/common/resources/icon.ico"))
                }

                macOS {
                    iconFile.set(rootProject.file("shared/src/common/resources/icon.icns"))
                }

                linux {
                    iconFile.set(rootProject.file("shared/src/common/resources/icon.png"))
                }
            }
        }
    }
}