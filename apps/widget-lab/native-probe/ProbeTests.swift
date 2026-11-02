import XCTest

final class NativeWidgetProbeTests: XCTestCase {
  func testPhoneEndpointRequiresHTTPSAndRejectsEmbeddedCredentials() throws {
    XCTAssertNoThrow(try ProbeEndpoint.resolve("https://fixture.example/disposable/", allowSimulatorLoopback: false))
    for value in ["http://127.0.0.1:43817", "http://fixture.example", "https://user:password@fixture.example", "https://fixture.example/?secret=test", "https://fixture.example/#fragment"] {
      XCTAssertThrowsError(try ProbeEndpoint.resolve(value, allowSimulatorLoopback: false))
    }
    XCTAssertNoThrow(try ProbeEndpoint.resolve("http://127.0.0.1:43817", allowSimulatorLoopback: true))
    XCTAssertThrowsError(try ProbeEndpoint.resolve("http://fixture.example", allowSimulatorLoopback: true))
  }
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
    try store.acknowledge(action.id)
    XCTAssertEqual(try store.state().confirmed, 1)
    _ = try store.enqueue(item: "sample", desired: true, version: 1)
    try ProbeVault.save(UUID().uuidString)
    do { try await ProbeWorker.synchronize(store); XCTFail("Invalid fixture credential unexpectedly succeeded") } catch { }
    XCTAssertEqual(try store.actions().count, 1)
    XCTAssertFalse(action.id.isEmpty)
  }
}
