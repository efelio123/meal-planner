import XCTest

final class NativeWidgetProbeTests: XCTestCase {
  func testSnapshotCannotErasePendingAction() throws {
    let first = try ProbeStore(); try first.clear()
    let action = try first.enqueue(item: "sample", desired: true, version: 1)
    try ProbeStore().publish("new snapshot from a second store instance")
    XCTAssertEqual(try first.actions().map(\.id), [action.id])
  }
  func testSecretRoundTripsThroughEntitledSharedKeychain() throws {
    let secret = UUID().uuidString + UUID().uuidString
    try ProbeVault.save(secret)
    XCTAssertEqual(try ProbeVault.read(), secret)
    try ProbeVault.clear()
    XCTAssertThrowsError(try ProbeVault.read())
  }
  func testNativeWorkerAcknowledgesOnlyAuthenticatedFixtureSuccess() async throws {
    let store = try ProbeStore(); try store.clear()
    let secret = UUID().uuidString + UUID().uuidString
    try ProbeVault.save(secret); try await ProbeWorker.seed(secret)
    let action = try store.enqueue(item: "sample", desired: true, version: 1)
    try await ProbeWorker.synchronize(store)
    XCTAssertTrue(try store.actions().isEmpty)
    _ = try store.enqueue(item: "sample", desired: true, version: 1)
    try ProbeVault.save(UUID().uuidString)
    do { try await ProbeWorker.synchronize(store); XCTFail("Invalid fixture credential unexpectedly succeeded") } catch { }
    XCTAssertEqual(try store.actions().count, 1)
    XCTAssertFalse(action.id.isEmpty)
  }
}
