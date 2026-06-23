import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

@available(iOS 16.1, *)
struct DistanceLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DistanceActivityAttributes.self) { context in
            QuestLockScreenView(state: context.state)
                .padding(14)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: context.state.tapURL))
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: s.stepSymbol).foregroundStyle(rarityColor(s.rarity))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if s.totalSteps > 0 {
                        Text("Step \(s.stepIndex + 1)/\(s.totalSteps)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.questName).font(.caption).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        if !s.stepLabel.isEmpty {
                            Text(s.stepLabel).font(.caption2).foregroundStyle(.secondary)
                        }
                        QuestStatusRow(state: s)
                        if !s.ctaText.isEmpty, let url = URL(string: s.ctaURL) {
                            Link(destination: url) {
                                Text(s.ctaText).font(.caption2).fontWeight(.semibold)
                            }
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: s.stepSymbol).foregroundStyle(rarityColor(s.rarity))
            } compactTrailing: {
                CompactTrailing(state: s)
            } minimal: {
                Image(systemName: s.stepSymbol).foregroundStyle(rarityColor(s.rarity))
            }
            .widgetURL(URL(string: s.tapURL))
        }
    }
}

@available(iOS 16.1, *)
private struct QuestLockScreenView: View {
    let state: DistanceActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                BrandMark()
                Text("The Earth App").font(.caption2).fontWeight(.semibold).foregroundStyle(.secondary)
                Spacer()
                if state.totalSteps > 0 {
                    Text("Step \(state.stepIndex + 1)/\(state.totalSteps)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 6) {
                Image(systemName: state.stepSymbol).foregroundStyle(rarityColor(state.rarity))
                Text(state.questName).font(.headline).lineLimit(1)
            }
            if !state.stepLabel.isEmpty {
                Text(state.stepLabel).font(.subheadline).fontWeight(.semibold)
            }
            if !state.stepDescription.isEmpty {
                Text(state.stepDescription).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            QuestStatusRow(state: state)
            if !state.ctaText.isEmpty, let url = URL(string: state.ctaURL) {
                Link(destination: url) {
                    Text(state.ctaText)
                        .font(.caption).fontWeight(.semibold)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(rarityColor(state.rarity).opacity(0.25))
                        .clipShape(Capsule())
                }
            }
        }
    }
}

@available(iOS 16.1, *)
private struct QuestStatusRow: View {
    let state: DistanceActivityAttributes.ContentState

    var body: some View {
        if let unlock = unlockDate(state.unlockAtMs), unlock > Date() {
            HStack(spacing: 4) {
                Image(systemName: "lock.fill").font(.caption2)
                Text("Unlocks in").font(.caption2)
                Text(timerInterval: Date()...unlock, countsDown: true)
                    .font(.caption2).monospacedDigit()
            }
            .foregroundStyle(.secondary)
        } else if state.progress >= 0 {
            ProgressView(value: min(1, max(0, state.progress))).tint(.green)
        }
    }
}

@available(iOS 16.1, *)
private struct CompactTrailing: View {
    let state: DistanceActivityAttributes.ContentState

    var body: some View {
        if let unlock = unlockDate(state.unlockAtMs), unlock > Date() {
            Text(timerInterval: Date()...unlock, countsDown: true)
                .font(.caption2).monospacedDigit().frame(maxWidth: 44)
        } else if state.progress >= 0 {
            Text("\(Int(min(1, max(0, state.progress)) * 100))%").font(.caption2).monospacedDigit()
        }
    }
}

// app icon from the widget asset catalog, falling back to a globe if the catalog hasn't compiled it
@available(iOS 16.1, *)
private struct BrandMark: View {
    var body: some View {
        Group {
            if UIImage(named: "AppLogo") != nil {
                Image("AppLogo").resizable().aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "globe.americas.fill").foregroundStyle(.green)
            }
        }
        .frame(width: 15, height: 15)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

private func rarityColor(_ rarity: String) -> Color {
    switch rarity {
    case "rare": return .blue
    case "amazing": return .purple
    case "green": return .green
    default: return .secondary
    }
}

private func unlockDate(_ ms: Double) -> Date? {
    ms > 0 ? Date(timeIntervalSince1970: ms / 1000) : nil
}
