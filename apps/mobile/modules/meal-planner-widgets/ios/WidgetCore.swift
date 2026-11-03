import Foundation
import Security
import SQLite3
import WidgetKit

typealias WidgetJSON = [String: Any]
enum WidgetFailure: Error { case unavailable, stale, offline, reconnect, backend, contract }
func widgetJSON(_ text: String?) -> WidgetJSON? {
  guard let text, let data = text.data(using: .utf8) else { return nil }
  return (try? JSONSerialization.jsonObject(with: data)) as? WidgetJSON
}
func widgetString(_ value: Any) throws -> String {
  String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), as: UTF8.self)
}
func widgetDate(_ value: Any?) -> Date? {
  guard let text = value as? String else { return nil }
  let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = parser.date(from: text) { return date }
  parser.formatOptions = [.withInternetDateTime]; return parser.date(from: text)
}

/// A bounded, local page over the last authoritative shopping snapshot.
struct WidgetShoppingPage {
  let index:Int
  let count:Int
  let range:Range<Int>
  init(items:Int,size:Int,requested:Int) {
    let size=max(1,size),items=max(0,items)
    count=max(1,(items+size-1)/size)
    index=min(max(0,requested),count-1)
    let start=index*size
    range=start..<min(items,start+size)
  }
}

/// Protected cross-process source of truth. No bearer credential is stored here.
final class WidgetStore {
  private static let mutex = NSLock()
  private let path: String
  init() throws {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "MealPlannerWidgetAppGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { throw WidgetFailure.unavailable }
    var directory = container.appendingPathComponent("MealPlannerWidgets-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
    var flags = URLResourceValues(); flags.isExcludedFromBackup = true; try directory.setResourceValues(flags)
    path = directory.appendingPathComponent("state.sqlite").path
    try transaction { db in
      try sql(db,"CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value TEXT NOT NULL)")
      try sql(db,"CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY,generation TEXT NOT NULL,item TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(generation,item))")
      try sql(db,"CREATE TABLE IF NOT EXISTS revocations (generation TEXT PRIMARY KEY,origin TEXT NOT NULL)")
    }
  }
  @discardableResult private func sql(_ db: OpaquePointer, _ query: String, _ values: [String?] = []) throws -> [[String:String]] {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db,query,-1,&stmt,nil)==SQLITE_OK, let statement=stmt else { throw WidgetFailure.unavailable }
    defer { sqlite3_finalize(statement) }
    for (index,value) in values.enumerated() {
      if let value { sqlite3_bind_text(statement,Int32(index+1),value,-1,unsafeBitCast(-1,to:sqlite3_destructor_type.self)) }
      else { sqlite3_bind_null(statement,Int32(index+1)) }
    }
    var rows: [[String:String]]=[]
    while true {
      let code=sqlite3_step(statement)
      if code==SQLITE_DONE { return rows }
      guard code==SQLITE_ROW else { throw WidgetFailure.unavailable }
      var row:[String:String]=[:]
      for col in 0..<sqlite3_column_count(statement) {
        if let value=sqlite3_column_text(statement,col) { row[String(cString:sqlite3_column_name(statement,col))]=String(cString:value) }
      }
      rows.append(row)
    }
  }
  private func transaction<T>(_ body:(OpaquePointer)throws->T) throws -> T {
    Self.mutex.lock(); defer { Self.mutex.unlock() }
    var handle:OpaquePointer?
    guard sqlite3_open_v2(path,&handle,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,nil)==SQLITE_OK,let db=handle else {
      if let handle { sqlite3_close(handle) }; throw WidgetFailure.unavailable
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db,4000)
    try sql(db,"PRAGMA journal_mode=WAL"); try sql(db,"BEGIN IMMEDIATE")
    do { let result=try body(db); try sql(db,"COMMIT"); return result }
    catch { try? sql(db,"ROLLBACK"); throw error }
  }
  private func get(_ db:OpaquePointer,_ key:String) throws -> String? { try sql(db,"SELECT value FROM state WHERE key=?",[key]).first?["value"] }
  private func set(_ db:OpaquePointer,_ key:String,_ value:String) throws { try sql(db,"INSERT OR REPLACE INTO state VALUES (?,?)",[key,value]) }
  private func reset(_ db:OpaquePointer) throws {
    if let config=widgetJSON(try get(db,"config")),let generation=config["generation"] as? String,let origin=config["api_origin"] as? String {
      try sql(db,"INSERT OR IGNORE INTO revocations VALUES (?,?)",[generation,origin])
    }
    try sql(db,"DELETE FROM state WHERE key<>'scope'"); try sql(db,"DELETE FROM outbox")
  }
  func verifySession(_ key:String?) throws {
    try transaction { db in
      let scope=try get(db,"scope")
      if let key,let scope,(scope==key || scope.hasPrefix(key+"|")) { return }
      if key==nil && scope==nil { return }
      try reset(db);try sql(db,"DELETE FROM state WHERE key='scope'")
      if let key { try set(db,"scope",key) }
    }
    WidgetCenter.shared.reloadAllTimelines()
  }
  func activate(_ scope:String?) throws {
    try transaction { db in
      if try get(db,"scope")==scope { return }
      try reset(db); try sql(db,"DELETE FROM state WHERE key='scope'")
      if let scope { try set(db,"scope",scope) }
    }
    WidgetCenter.shared.reloadAllTimelines()
  }
  func context() throws -> WidgetJSON? { try transaction { db in widgetJSON(try get(db,"config")) } }
  func isCurrent(_ config:WidgetJSON) throws -> Bool {
    try transaction { db in
      let current=widgetJSON(try get(db,"config"))
      let scope=try get(db,"scope")
      return current?["generation"] as? String == config["generation"] as? String && getScope(config)==scope
    }
  }
  private func getScope(_ config:WidgetJSON) -> String? { config["scope"] as? String }
  func prepare(_ settings:WidgetJSON,_ force:Bool) throws -> WidgetJSON {
    try transaction { db in
      guard let scope=settings["scope"] as? String,scope==(try get(db,"scope")) else { throw WidgetFailure.stale }
      if force { try reset(db) }
      var config=widgetJSON(try get(db,"config")) ?? [:]
      if config.isEmpty {
        let generation=UUID().uuidString.lowercased()
        try WidgetVault.save(WidgetVault.random(),generation)
        config=["scope":scope,"device_id":UUID().uuidString.lowercased(),"generation":generation,"registered":false]
      }
      for key in ["api_origin","household_id","user_id","week_start","theme"] { config[key]=settings[key] }
      try set(db,"config",widgetString(config)); return config
    }
  }
  func update(_ config:WidgetJSON) throws {
    try transaction { db in
      let current=widgetJSON(try get(db,"config"))
      guard current?["generation"] as? String == config["generation"] as? String,
            getScope(config)==(try get(db,"scope")) else { throw WidgetFailure.stale }
      try set(db,"config",widgetString(config))
    }
  }
  func fail(_ state:String,_ config:WidgetJSON?) throws {
    try transaction { db in
      let current=widgetJSON(try get(db,"config"))
      if let config, current?["generation"] as? String != config["generation"] as? String { return }
      try set(db,"error",state)
      if state=="reconnect" { try sql(db,"DELETE FROM outbox"); try sql(db,"DELETE FROM state WHERE key='snapshot'") }
    }
  }
  func pending(_ config:WidgetJSON) throws -> [WidgetJSON] {
    try transaction { db in try sql(db,"SELECT body FROM outbox WHERE generation=? ORDER BY rowid",[config["generation"] as? String]).compactMap { widgetJSON($0["body"]) } }
  }
  func enqueue(_ generation:String,_ item:String,_ version:Int) throws {
    try transaction { db in
      guard let config=widgetJSON(try get(db,"config")),config["generation"] as? String==generation,version>0,
            let snapshot=widgetJSON(try get(db,"snapshot")),snapshot["can_check"] as? Bool==true,
            let expiry=widgetDate(config["expires_at"]),expiry>Date() else { throw WidgetFailure.stale }
      let count=try sql(db,"SELECT count(*) AS count FROM outbox").first?["count"] ?? "0"
      guard (Int(count) ?? 100)<100 else { throw WidgetFailure.offline }
      let body:WidgetJSON=["generation":generation,"operation_id":UUID().uuidString.lowercased(),"item_id":item,"expected_version":version,"is_checked":true]
      try sql(db,"INSERT OR IGNORE INTO outbox VALUES (?,?,?,?)",[body["operation_id"] as? String,generation,item,try widgetString(body)])
    }
  }
  func commit(_ config:WidgetJSON,_ snapshot:WidgetJSON,_ terminal:[String],_ changed:Bool) throws {
    try transaction { db in
      guard let current=widgetJSON(try get(db,"config")),current["generation"] as? String==config["generation"] as? String,
            getScope(config)==(try get(db,"scope")) else { throw WidgetFailure.stale }
      for id in terminal { try sql(db,"DELETE FROM outbox WHERE id=? AND generation=?",[id,config["generation"] as? String]) }
      if snapshot["can_check"] as? Bool != true { try sql(db,"DELETE FROM outbox") }
      let prior=widgetJSON(try get(db,"snapshot"))?["snapshot_version"] as? Int ?? 0
      if (snapshot["snapshot_version"] as? Int ?? 0)>=prior {
        try set(db,"snapshot",widgetString(snapshot)); try set(db,"error",changed ? "changed" : "")
        // A removed last row must not leave a blank page, or reappear on a later refresh.
        let items=((snapshot["shopping"] as? WidgetJSON)?["items"] as? [WidgetJSON])?.count ?? 0
        for size in [3,7] {
          let key="shopping_page_\(size)"
          let page=WidgetShoppingPage(items:items,size:size,requested:Int(try get(db,key) ?? "0") ?? 0)
          try set(db,key,String(page.index))
        }
      }
    }
  }
  func select(_ generation:String,_ mode:String?,_ day:Int?) throws {
    try transaction { db in
      guard widgetJSON(try get(db,"config"))?["generation"] as? String==generation else { return }
      if let mode, ["shopping","plan"].contains(mode) { try set(db,"view",mode) }
      if let day, (0...6).contains(day) { try set(db,"day",String(day)) }
    }
  }
  func selectShoppingPage(_ generation:String,_ requested:Int,_ size:Int) throws {
    try transaction { db in
      guard [3,7].contains(size),
            let config=widgetJSON(try get(db,"config")),config["generation"] as? String==generation,
            getScope(config)==(try get(db,"scope")),
            let expiry=widgetDate(config["expires_at"]),expiry>Date(),
            let snapshot=widgetJSON(try get(db,"snapshot")) else { return }
      let items=((snapshot["shopping"] as? WidgetJSON)?["items"] as? [WidgetJSON])?.count ?? 0
      let page=WidgetShoppingPage(items:items,size:size,requested:requested)
      try set(db,"shopping_page_\(size)",String(page.index))
    }
  }
  func presentation() throws -> WidgetJSON {
    try transaction { db in
      let config=widgetJSON(try get(db,"config")) ?? [:]
      let error=try get(db,"error") ?? ""
      let expired=(widgetDate(config["expires_at"]) ?? .distantPast)<=Date()
      var result:WidgetJSON=["available":true,"enabled":!config.isEmpty,"needs_reconnect":error=="reconnect" || (config["registered"] as? Bool == true && expired),
        "pending_count":try sql(db,"SELECT id FROM outbox").count,"state":error,"view":try get(db,"view") ?? "shopping","day":Int(try get(db,"day") ?? "0") ?? 0,"config":config]
      for size in [3,7] { result["shopping_page_\(size)"]=Int(try get(db,"shopping_page_\(size)") ?? "0") ?? 0 }
      if !expired && error != "reconnect", let snapshot=widgetJSON(try get(db,"snapshot")) { result["snapshot"]=snapshot }
      return result
    }
  }
  func revocations() throws -> [[String:String]] { try transaction { db in try sql(db,"SELECT * FROM revocations LIMIT 3") } }
  func didRevoke(_ generation:String) throws { try transaction { db in try sql(db,"DELETE FROM revocations WHERE generation=?",[generation]) }; try WidgetVault.remove(generation) }
  func disable(_ scope:String) throws { try transaction { db in guard scope==(try get(db,"scope")) else { throw WidgetFailure.stale }; try reset(db) }; WidgetCenter.shared.reloadAllTimelines() }
}

/// Shared Keychain, with no app-sandbox/plaintext fallback.
enum WidgetVault {
  private static func query(_ generation:String) throws -> WidgetJSON {
    guard let group=Bundle.main.object(forInfoDictionaryKey:"MealPlannerWidgetKeychainGroup") as? String,!group.isEmpty else { throw WidgetFailure.unavailable }
    return [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"MealPlannerWidgets.v1",kSecAttrAccount as String:generation,kSecAttrAccessGroup as String:group]
  }
  static func random() throws -> String {
    var bytes=[UInt8](repeating:0,count:48)
    guard SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes)==errSecSuccess else { throw WidgetFailure.unavailable }
    return Data(bytes).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
  }
  static func save(_ secret:String,_ generation:String) throws {
    var value=try query(generation); value[kSecValueData as String]=Data(secret.utf8); value[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    guard SecItemAdd(value as CFDictionary,nil)==errSecSuccess else { throw WidgetFailure.unavailable }
  }
  static func read(_ generation:String) throws -> String {
    var value=try query(generation); value[kSecReturnData as String]=true
    var output:CFTypeRef?
    guard SecItemCopyMatching(value as CFDictionary,&output)==errSecSuccess,let data=output as? Data,let secret=String(data:data,encoding:.utf8) else { throw WidgetFailure.reconnect }
    return secret
  }
  static func remove(_ generation:String) throws { SecItemDelete(try query(generation) as CFDictionary) }
}
private final class WidgetNoRedirect:NSObject,URLSessionTaskDelegate {
  func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void) { completionHandler(nil) }
}
actor WidgetService {
  static let shared=WidgetService()
  private let session=URLSession(configuration:.ephemeral,delegate:WidgetNoRedirect(),delegateQueue:nil)
  private func request(_ origin:String,_ path:String,_ method:String,_ auth:String,_ body:WidgetJSON?=nil) async throws -> WidgetJSON {
    guard let parts=URLComponents(string:origin),parts.scheme=="https",parts.host != nil,parts.user==nil,parts.password==nil,
      parts.query==nil,parts.fragment==nil,(parts.path.isEmpty || parts.path=="/"),let base=parts.url,let url=URL(string:path,relativeTo:base) else { throw WidgetFailure.backend }
    var request=URLRequest(url:url); request.httpMethod=method; request.timeoutInterval=4
    request.setValue(auth,forHTTPHeaderField:"Authorization"); request.setValue("application/json",forHTTPHeaderField:"Content-Type")
    if let body { request.httpBody=try JSONSerialization.data(withJSONObject:body) }
    let(data,response)=try await session.data(for:request)
    guard let response=response as? HTTPURLResponse else { throw WidgetFailure.offline }
    if [401,403,409].contains(response.statusCode) { throw WidgetFailure.reconnect }
    if response.statusCode==404 { throw WidgetFailure.backend }
    guard (200...299).contains(response.statusCode),data.count<=1_000_000 else { throw WidgetFailure.offline }
    if data.isEmpty { return [:] }
    guard let result=(try JSONSerialization.jsonObject(with:data)) as? WidgetJSON else { throw WidgetFailure.contract }
    return result
  }
  func revokeOld() async {
    guard let store=try? WidgetStore(),let rows=try? store.revocations() else { return }
    for row in rows {
      guard let generation=row["generation"],let origin=row["origin"] else { continue }
      do {
        let secret=try WidgetVault.read(generation)
        _=try await request(origin,"/v1/widget/disconnect","POST","Widget "+secret)
        try store.didRevoke(generation)
      } catch { /* Retain native-only credential for later revocation; API expiry is bounded. */ }
    }
  }
  func connect(_ settings:WidgetJSON,_ clerk:String,_ force:Bool) async {
    guard let store=try? WidgetStore() else { return }
    var config:WidgetJSON?
    do {
      let prepared=try store.prepare(settings,force); config=prepared
      guard try store.isCurrent(prepared),let origin=prepared["api_origin"] as? String,let device=prepared["device_id"] as? String,
        let home=prepared["household_id"] as? String,let generation=prepared["generation"] as? String else { throw WidgetFailure.stale }
      if (prepared["registered_at"] as? Double ?? 0)<Date().timeIntervalSince1970-86400 || prepared["week_start"] as? Int != prepared["registered_week_start"] as? Int {
        let body:WidgetJSON=["secret":try WidgetVault.read(generation),"generation":generation,"week_start":prepared["week_start"] ?? 1]
        let result=try await request(origin,"/v1/households/\(home)/widget-devices/\(device)","PUT","Bearer "+clerk,body)
        guard result["user_id"] as? String==prepared["user_id"] as? String,result["household_id"] as? String==home,
          result["generation"] as? String==generation,result["device_id"] as? String==device else { throw WidgetFailure.reconnect }
        var updated=prepared;updated["registered"]=true;updated["registered_at"]=Date().timeIntervalSince1970;updated["registered_week_start"]=prepared["week_start"];updated["expires_at"]=result["expires_at"]
        try store.update(updated)
      }
      await sync()
    } catch WidgetFailure.stale { } catch WidgetFailure.reconnect { try? store.fail("reconnect",config) }
      catch WidgetFailure.backend { try? store.fail("backend",config) } catch { try? store.fail("offline",config) }
    await revokeOld();WidgetCenter.shared.reloadAllTimelines()
  }
  func sync(reload:Bool = true) async {
    guard let store=try? WidgetStore(),let config=try? store.context(),config["registered"] as? Bool==true else { return }
    do {
      let state=try store.presentation(); guard state["needs_reconnect"] as? Bool != true else { throw WidgetFailure.reconnect }
      guard let origin=config["api_origin"] as? String,let generation=config["generation"] as? String else { throw WidgetFailure.contract }
      let auth="Widget "+(try WidgetVault.read(generation));var terminal:[String]=[];var changed=false
      for action in try store.pending(config).prefix(3) {
        guard try store.isCurrent(config) else { throw WidgetFailure.stale }
        let result=try await request(origin,"/v1/widget/checkoffs","POST",auth,action)
        guard result["operation_id"] as? String==action["operation_id"] as? String,result["generation"] as? String==generation,
          let status=result["status"] as? String,["confirmed","gone","conflict"].contains(status),let id=action["operation_id"] as? String else { throw WidgetFailure.contract }
        terminal.append(id);changed = changed || status != "confirmed"
      }
      guard try store.isCurrent(config) else { throw WidgetFailure.stale }
      let snapshot=try await request(origin,"/v1/widget/summary","GET",auth)
      guard snapshot["schema_version"] as? Int==1,(snapshot["snapshot_version"] as? Int ?? 0)>0,snapshot["generation"] as? String==generation,
        snapshot["device_id"] as? String==config["device_id"] as? String,snapshot["user_id"] as? String==config["user_id"] as? String,
        snapshot["household_id"] as? String==config["household_id"] as? String,
        ((snapshot["plan"] as? WidgetJSON)?["days"] as? [WidgetJSON])?.count==7,snapshot["shopping"] is WidgetJSON else { throw WidgetFailure.contract }
      // Publish authoritative state and consume terminal operations in one transaction.
      // If this GET fails, retained operation IDs are safe to retry after a lost acknowledgement.
      try store.commit(config,snapshot,terminal,changed)
    } catch WidgetFailure.stale { } catch WidgetFailure.reconnect { try? store.fail("reconnect",config) }
      catch WidgetFailure.backend { try? store.fail("backend",config) } catch { try? store.fail("offline",config) }
    if reload { WidgetCenter.shared.reloadAllTimelines() }
  }
}
