import AppIntents
import SwiftUI
import WidgetKit

struct ProbeTap: AppIntent {
  static var title: LocalizedStringResource = "Queue a fictional checkoff"
  func perform() async throws -> some IntentResult {
    let store = try ProbeStore()
    _ = try store.enqueue(item: "fictional-item", desired: true, version: 1)
    // This native execution path does not depend on a React Native listener.
    try? await ProbeWorker.synchronize(store)
    return .result()
  }
}
struct ProbeEntry: TimelineEntry { let date: Date; let pending: Int }
struct ProbeProvider: TimelineProvider {
  func placeholder(in context: Context) -> ProbeEntry { ProbeEntry(date: Date(), pending: 0) }
  func getSnapshot(in context: Context, completion: @escaping (ProbeEntry) -> Void) { completion(ProbeEntry(date: Date(), pending: (try? ProbeStore().actions().count) ?? 0)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<ProbeEntry>) -> Void) { getSnapshot(in: context) { entry in completion(Timeline(entries: [entry], policy: .never)) } }
}
struct ProbeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NativeWidgetProbe", provider: ProbeProvider()) { entry in
      VStack {
        Text("Native Widget Probe")
        Text("\(entry.pending) pending sample actions")
        Button(intent: ProbeTap()) { Text("Queue sample checkoff") }
      }.containerBackground(.background, for: .widget)
    }.configurationDisplayName("Native Widget Probe").description("Fictional-data gate; no family API.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
@main struct ProbeWidgetBundle: WidgetBundle { var body: some Widget { ProbeWidget() } }
