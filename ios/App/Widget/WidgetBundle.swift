import SwiftUI
import WidgetKit

@main
struct EarthAppWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            DistanceLiveActivityWidget()
        }
    }
}
