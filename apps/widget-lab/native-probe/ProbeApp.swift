import SwiftUI

@main struct NativeWidgetProbeApp: App {
  @State private var status = "Disposable native storage and networking gate. No family data."
  var body: some Scene { WindowGroup {
    VStack(spacing: 20) {
      Text("Native Widget Probe").font(.title)
      Text(status)
      Button("Run native self-check") { Task {
        do {
          let store = try ProbeStore(); try store.clear()
          let secret = UUID().uuidString + UUID().uuidString
          try ProbeVault.save(secret); try await ProbeWorker.seed(secret)
          _ = try store.enqueue(item: "fictional-item", desired: true, version: 1)
          try store.publish("A fresh snapshot preserves the outbox")
          try await ProbeWorker.synchronize(store)
          status = "Secure storage and disposable native request passed."
        } catch { status = "Native gate failed: \(error)" }
      } }
    }.padding()
  } }
}
