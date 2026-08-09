// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "SkyKit",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "SkyKit", targets: ["SkyKit"])
    ],
    targets: [
        .target(name: "SkyKit"),
        .testTarget(name: "SkyKitTests", dependencies: ["SkyKit"])
    ]
)
