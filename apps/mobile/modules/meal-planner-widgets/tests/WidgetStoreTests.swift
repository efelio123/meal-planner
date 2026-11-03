import XCTest

final class WidgetStoreTests:XCTestCase {
  override func tearDownWithError() throws {
    let store=try WidgetStore();try store.activate(nil)
    while true {
      let rows=try store.revocations();if rows.isEmpty { break }
      for row in rows { if let generation=row["generation"] { try store.didRevoke(generation) } }
    }
  }
  let session="fixture-session"
  var scope:String { session+"|home" }
  func setupBinding() throws -> (WidgetStore,WidgetJSON,WidgetJSON) {
    let store=try WidgetStore();try store.activate(nil);try store.activate(scope)
    let settings:WidgetJSON=["scope":scope,"api_origin":"https://fixture.invalid","user_id":"test-user","household_id":"test-home","week_start":1,"theme":["light":[:],"dark":[:]]]
    var config=try store.prepare(settings,false);config["registered"]=true;config["expires_at"]=ISO8601DateFormatter().string(from:Date().addingTimeInterval(86400));try store.update(config)
    let snapshot:WidgetJSON=["schema_version":1,"snapshot_version":1,"can_check":true,"shopping":["unpurchased_count":1,"items":[]],"plan":["days":Array(repeating:["date":"2026-11-02","meals":[]],count:7)]]
    try store.commit(config,snapshot,[],false)
    return (store,config,snapshot)
  }
  func testPublicationAndOldResponsesPreservePendingAndNewerSnapshot() throws {
    let(store,config,snapshot)=try setupBinding();let generation=config["generation"] as! String
    try store.enqueue(generation,"item",1)
    var newer=snapshot;newer["snapshot_version"]=3;try store.commit(config,newer,[],false)
    try store.commit(config,snapshot,[],false)
    XCTAssertEqual((try store.presentation()["snapshot"] as? WidgetJSON)?["snapshot_version"] as? Int,3)
    XCTAssertEqual(try store.pending(config).count,1)
    let action=try store.pending(config)[0]
    try store.commit(config,newer,[action["operation_id"] as! String],false)
    XCTAssertEqual(try store.pending(config).count,0)
  }
  func testSameSessionFencePreservesOfflineWorkButNewSessionClearsIt() throws {
    let(store,config,_)=try setupBinding();try store.enqueue(config["generation"] as! String,"item",1)
    try store.verifySession(session)
    XCTAssertEqual(try store.pending(config).count,1)
    try store.verifySession("different-session")
    XCTAssertNil(try store.context());XCTAssertEqual(try store.presentation()["pending_count"] as? Int,0)
    XCTAssertTrue(try store.revocations().contains { $0["generation"]==config["generation"] as? String })
  }
  func testOldScopeResponsesAndTapsCannotMutateNewScope() throws {
    let(store,config,snapshot)=try setupBinding()
    try store.activate(session+"|another-home")
    XCTAssertThrowsError(try store.commit(config,snapshot,[],false))
    XCTAssertThrowsError(try store.enqueue(config["generation"] as! String,"item",1))
    XCTAssertNil(try store.presentation()["snapshot"])
  }
  func testCredentialNeverAppearsInSharedSnapshotOrDatabaseState() throws {
    let(store,config,_)=try setupBinding()
    let secret=try WidgetVault.read(config["generation"] as! String)
    XCTAssertFalse(try widgetString(store.presentation()).contains(secret))
    XCTAssertFalse(try widgetString(store.revocations()).contains(secret))
    try store.activate(nil)
    XCTAssertNil(try store.presentation()["snapshot"])
  }
  func testAnUnconfirmedRegistrationCanRetryWithoutDiscardingItsBinding() throws {
    let(store,original,_)=try setupBinding();var config=original
    config["registered"]=false;config.removeValue(forKey:"expires_at");try store.update(config)
    try store.fail("offline",config)
    XCTAssertEqual(try store.presentation()["needs_reconnect"] as? Bool,false)
    let retry=try store.prepare(config,false)
    XCTAssertEqual(retry["generation"] as? String,config["generation"] as? String)
  }
  func testExpiredConnectionCannotQueueOrDisplayHouseholdData() throws {
    let(store,original,_)=try setupBinding();var config=original
    config["expires_at"]=ISO8601DateFormatter().string(from:Date().addingTimeInterval(-60));try store.update(config)
    XCTAssertNil(try store.presentation()["snapshot"])
    XCTAssertThrowsError(try store.enqueue(config["generation"] as! String,"item",1))
  }
}
