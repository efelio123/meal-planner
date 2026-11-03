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
  func shoppingSnapshot(_ original:WidgetJSON,_ count:Int,_ version:Int) -> WidgetJSON {
    var snapshot=original;snapshot["snapshot_version"]=version
    snapshot["shopping"]=["unpurchased_count":count,"items":(0..<count).map { ["id":"item-\($0)","name":"Item \($0)","check_version":1] as WidgetJSON }]
    return snapshot
  }
  func testShoppingPagesCoverEveryCachedItemAndClampAtBothEnds() {
    for size in [3,7] {
      for count in [0,1,3,7,8,40] {
        let first=WidgetShoppingPage(items:count,size:size,requested:-1)
        XCTAssertEqual(first.index,0)
        var visited:[Int]=[]
        for requested in 0..<first.count { visited += WidgetShoppingPage(items:count,size:size,requested:requested).range }
        XCTAssertEqual(visited,Array(0..<count))
        let last=WidgetShoppingPage(items:count,size:size,requested:Int.max)
        XCTAssertEqual(last.index,first.count-1)
        XCTAssertLessThanOrEqual(last.range.count,size)
      }
    }
  }
  func testShoppingPageSurvivesOfflineAndViewChangesWithIndependentSizes() throws {
    let(store,config,original)=try setupBinding();let generation=config["generation"] as! String
    try store.commit(config,shoppingSnapshot(original,15,2),[],false)
    try store.selectShoppingPage(generation,3,3);try store.selectShoppingPage(generation,1,7)
    try store.select(generation,"plan",4);try store.fail("offline",config)
    let reopened=try WidgetStore();let state=try reopened.presentation()
    XCTAssertEqual(state["shopping_page_3"] as? Int,3)
    XCTAssertEqual(state["shopping_page_7"] as? Int,1)
    XCTAssertEqual(state["view"] as? String,"plan")
    try reopened.selectShoppingPage(generation,4,3)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,4)
  }
  func testShoppingPageClampsAfterConfirmedRemovalAndDoesNotReturnWhenListGrows() throws {
    let(store,config,original)=try setupBinding();let generation=config["generation"] as! String
    try store.commit(config,shoppingSnapshot(original,8,2),[],false)
    try store.selectShoppingPage(generation,2,3);try store.selectShoppingPage(generation,1,7)
    try store.enqueue(generation,"item-7",1)
    try store.selectShoppingPage(generation,0,3)
    XCTAssertEqual(try store.pending(config).count,1,"Paging must preserve queued checkoffs")
    try store.selectShoppingPage(generation,2,3)
    let action=try store.pending(config)[0]["operation_id"] as! String
    try store.commit(config,shoppingSnapshot(original,6,3),[action],false)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,1)
    XCTAssertEqual(try store.presentation()["shopping_page_7"] as? Int,0)
    try store.commit(config,shoppingSnapshot(original,15,4),[],false)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,1)
    try store.commit(config,shoppingSnapshot(original,0,5),[],false)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,0)
    XCTAssertEqual(try store.pending(config).count,0)
  }
  func testStaleOrInvalidPageActionsCannotChangeANewHousehold() throws {
    let(store,config,original)=try setupBinding();let generation=config["generation"] as! String
    try store.commit(config,shoppingSnapshot(original,15,2),[],false)
    try store.selectShoppingPage(generation,3,3)
    try store.selectShoppingPage("old-generation",0,3)
    try store.selectShoppingPage(generation,0,4)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,3)
    try store.activate(session+"|another-home")
    try store.selectShoppingPage(generation,3,3)
    XCTAssertEqual(try store.presentation()["shopping_page_3"] as? Int,0)
    XCTAssertNil(try store.presentation()["snapshot"])
  }
}
