import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitDistancePlugin())
        bridge?.registerPluginInstance(DistanceLiveActivityPlugin())
    }
}
