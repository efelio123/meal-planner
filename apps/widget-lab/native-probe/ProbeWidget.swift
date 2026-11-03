import AppIntents
import SwiftUI
import WidgetKit

struct ProbeTap: AppIntent {
  static var title: LocalizedStringResource = "Queue a fictional checkoff"
  static var openAppWhenRun = false
  func perform() async throws -> some IntentResult {
    let store = try ProbeStore()
    _ = try store.enqueue(item: "fictional-item", desired: true, version: 1)
    // Native execution: no React Native listener or main-app launch.
    try? await ProbeWorker.synchronize(store)
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
struct ProbeRetry: AppIntent {
  static var title: LocalizedStringResource = "Retry pending fictional checkoffs"
  static var openAppWhenRun = false
  func perform() async throws -> some IntentResult {
    try? await ProbeWorker.synchronize(ProbeStore())
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
struct ProbeEntry: TimelineEntry { let date: Date; let state: ProbeState? }
struct ProbeProvider: TimelineProvider {
  func placeholder(in context: Context) -> ProbeEntry { ProbeEntry(date: Date(), state: nil) }
  func getSnapshot(in context: Context, completion: @escaping (ProbeEntry) -> Void) { completion(ProbeEntry(date: Date(), state: try? ProbeStore().state())) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<ProbeEntry>) -> Void) { getSnapshot(in: context) { entry in completion(Timeline(entries: [entry], policy: .never)) } }
}
struct ProbeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NativeWidgetProbe", provider: ProbeProvider()) { entry in
      VStack(spacing: 8) {
        Text("Native Widget Probe").font(.headline)
        if let state = entry.state {
          Text("\(state.confirmed) confirmed · \(state.pending) pending")
          if state.pending > 0 { Button(intent: ProbeRetry()) { Text("Retry pending") } }
          else { Button(intent: ProbeTap()) { Text("Test native tap") } }
        } else { Text("Open probe to check shared storage") }
      }.containerBackground(.background, for: .widget)
    }.configurationDisplayName("Native Widget Probe").description("Fictional-data gate; no family API.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
@main struct ProbeWidgetBundle: WidgetBundle { var body: some Widget { ProbeWidget() } }
