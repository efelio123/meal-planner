import SwiftUI
import WidgetKit

@main struct NativeWidgetProbeApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var status = "Disposable native storage and networking gate. Fictional data only."
  @State private var counts = "Not checked yet"
  private func refresh() {
    if let state = try? ProbeStore().state() { counts = "\(state.confirmed) confirmed · \(state.pending) pending" }
    else { counts = "Shared storage unavailable" }
  }
  var body: some Scene { WindowGroup {
    VStack(spacing: 20) {
      Text("Native Widget Probe").font(.title)
      Text(status)
      Text(counts).font(.headline)
      Button("Run native self-check") { Task {
        do {
          _ = try ProbeWorker.origin()
          let store = try ProbeStore(); try store.clear()
          let secret = UUID().uuidString + UUID().uuidString
          try ProbeVault.save(secret); try await ProbeWorker.seed(secret)
          _ = try store.enqueue(item: "fictional-item", desired: true, version: 1)
          try store.publish("A fresh snapshot preserves the outbox")
          try await ProbeWorker.synchronize(store)
          status = "Self-check passed. Add the Native Widget Probe to your Home Screen, leave this app, then tap Test native tap."
        } catch { status = "Native gate failed: \(error)" }
        refresh(); WidgetCenter.shared.reloadAllTimelines()
      } }
    }.padding().onAppear { refresh() }.onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
  } }
}
