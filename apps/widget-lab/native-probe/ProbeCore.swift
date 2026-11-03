import Foundation
import Security
import SQLite3

struct ProbeFailure: Error { let message: String }
struct ProbeState { let pending: Int; let confirmed: Int }
struct ProbeAction: Codable {
  let id: String
  let itemID: String
  let desired: Bool
  let version: Int
}

/// Gate code: protected App Group storage; never falls back to the app sandbox.
final class ProbeStore {
  private static let lock = NSLock()
  private let path: String
  init() throws {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ProbeAppGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw ProbeFailure(message: "App Group is unavailable")
    }
    let directory = container.appendingPathComponent("NativeWidgetProbe", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
    path = directory.appendingPathComponent("probe.sqlite").path
    try transaction { db in
      try execute(db, "CREATE TABLE IF NOT EXISTS snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
      try execute(db, "CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY,item TEXT NOT NULL,desired INTEGER NOT NULL,version INTEGER NOT NULL)")
    }
  }
  private func execute(_ db: OpaquePointer, _ sql: String) throws {
    guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw ProbeFailure(message: "Native database operation failed") }
  }
  private func transaction<T>(_ action: (OpaquePointer) throws -> T) throws -> T {
    Self.lock.lock(); defer { Self.lock.unlock() }
    var pointer: OpaquePointer?
    guard sqlite3_open_v2(path, &pointer, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK, let db = pointer else {
      if let pointer { sqlite3_close(pointer) }; throw ProbeFailure(message: "Native database unavailable")
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 3000)
    try execute(db, "PRAGMA journal_mode=WAL")
    try execute(db, "BEGIN IMMEDIATE")
    do { let value = try action(db); try execute(db, "COMMIT"); return value }
    catch { try? execute(db, "ROLLBACK"); throw error }
  }
  func clear() throws { try transaction { db in try execute(db, "DELETE FROM snapshot"); try execute(db, "DELETE FROM outbox") } }
  func publish(_ value: String) throws {
    try transaction { db in
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO snapshot VALUES ('value',?)", -1, &stmt, nil) == SQLITE_OK else { throw ProbeFailure(message: "Prepare failed") }
      defer { sqlite3_finalize(stmt) }
      sqlite3_bind_text(stmt, 1, value, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
      guard sqlite3_step(stmt) == SQLITE_DONE else { throw ProbeFailure(message: "Publish failed") }
    }
  }
  func enqueue(item: String, desired: Bool, version: Int) throws -> ProbeAction {
    let action = ProbeAction(id: UUID().uuidString, itemID: item, desired: desired, version: version)
    try transaction { db in
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, "INSERT INTO outbox VALUES (?,?,?,?)", -1, &stmt, nil) == SQLITE_OK else { throw ProbeFailure(message: "Prepare failed") }
      defer { sqlite3_finalize(stmt) }
      for (index, value) in [action.id, action.itemID].enumerated() { sqlite3_bind_text(stmt, Int32(index + 1), value, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
      sqlite3_bind_int(stmt, 3, desired ? 1 : 0); sqlite3_bind_int(stmt, 4, Int32(version))
      guard sqlite3_step(stmt) == SQLITE_DONE else { throw ProbeFailure(message: "Enqueue failed") }
    }
    return action
  }
  func actions() throws -> [ProbeAction] {
    try transaction { db in
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, "SELECT id,item,desired,version FROM outbox ORDER BY rowid", -1, &stmt, nil) == SQLITE_OK else { throw ProbeFailure(message: "Read failed") }
      defer { sqlite3_finalize(stmt) }
      var actions: [ProbeAction] = []
      while sqlite3_step(stmt) == SQLITE_ROW {
        actions.append(ProbeAction(id: String(cString: sqlite3_column_text(stmt, 0)), itemID: String(cString: sqlite3_column_text(stmt, 1)), desired: sqlite3_column_int(stmt, 2) != 0, version: Int(sqlite3_column_int(stmt, 3))))
      }
      return actions
    }
  }
  func state() throws -> ProbeState {
    try transaction { db in
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, "SELECT (SELECT count(*) FROM outbox),coalesce((SELECT cast(value AS INTEGER) FROM snapshot WHERE key='confirmed'),0)", -1, &stmt, nil) == SQLITE_OK else { throw ProbeFailure(message: "State read failed") }
      defer { sqlite3_finalize(stmt) }
      guard sqlite3_step(stmt) == SQLITE_ROW else { throw ProbeFailure(message: "State unavailable") }
      return ProbeState(pending: Int(sqlite3_column_int(stmt, 0)), confirmed: Int(sqlite3_column_int(stmt, 1)))
    }
  }
  func acknowledge(_ id: String) throws {
    try transaction { db in
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, "DELETE FROM outbox WHERE id=?", -1, &stmt, nil) == SQLITE_OK else { throw ProbeFailure(message: "Prepare failed") }
      defer { sqlite3_finalize(stmt) }
      sqlite3_bind_text(stmt, 1, id, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
      guard sqlite3_step(stmt) == SQLITE_DONE else { throw ProbeFailure(message: "Acknowledge failed") }
      if sqlite3_changes(db) == 1 {
        try execute(db, "INSERT INTO snapshot(key,value) VALUES ('confirmed','1') ON CONFLICT(key) DO UPDATE SET value=cast(value AS INTEGER)+1")
      }
    }
  }
}

enum ProbeVault {
  private static func query() throws -> [String: Any] {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ProbeKeychainGroup") as? String, !group.isEmpty else { throw ProbeFailure(message: "Shared Keychain group is not configured") }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "NativeWidgetProbe", kSecAttrAccount as String: "disposable", kSecAttrAccessGroup as String: group]
  }
  static func save(_ secret: String) throws {
    var query = try query(); SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = Data(secret.utf8)
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw ProbeFailure(message: "Shared Keychain save failed: \(status)") }
  }
  static func read() throws -> String {
    var query = try query(); query[kSecReturnData as String] = true
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { throw ProbeFailure(message: "Shared Keychain read failed: \(status)") }
    return value
  }
  static func clear() throws { SecItemDelete(try query() as CFDictionary) }
}

/// Test endpoint only. Devices require HTTPS; loopback HTTP is simulator-only.
enum ProbeEndpoint {
  static func resolve(_ value: String, allowSimulatorLoopback: Bool) throws -> URL {
    guard let parts = URLComponents(string: value), let url = parts.url,
          let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
          parts.query == nil, parts.fragment == nil else { throw ProbeFailure(message: "Invalid disposable fixture URL") }
    if parts.scheme == "https" { return url }
    guard allowSimulatorLoopback, parts.scheme == "http", host == "127.0.0.1", parts.port == 43817,
          parts.path.isEmpty || parts.path == "/" else { throw ProbeFailure(message: "The phone fixture requires HTTPS") }
    return url
  }
}
private final class ProbeNoRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Calls only the configured disposable fixture, never the family API.
enum ProbeWorker {
  private static let session = URLSession(configuration: .ephemeral, delegate: ProbeNoRedirect(), delegateQueue: nil)
  static func origin() throws -> URL {
    #if targetEnvironment(simulator)
    return try ProbeEndpoint.resolve("http://127.0.0.1:43817", allowSimulatorLoopback: true)
    #else
    guard let value = Bundle.main.object(forInfoDictionaryKey: "ProbeFixtureOrigin") as? String else {
      throw ProbeFailure(message: "Configure the disposable HTTPS fixture before phone testing")
    }
    return try ProbeEndpoint.resolve(value, allowSimulatorLoopback: false)
    #endif
  }
  static func seed(_ secret: String) async throws {
    var request = URLRequest(url: try origin().appendingPathComponent("seed")); request.httpMethod = "POST"; request.timeoutInterval = 8
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["secret": secret])
    let (_, response) = try await session.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProbeFailure(message: "Disposable fixture setup failed") }
  }
  static func synchronize(_ store: ProbeStore) async throws {
    for action in try store.actions() {
      var request = URLRequest(url: try origin().appendingPathComponent("check")); request.httpMethod = "POST"; request.timeoutInterval = 8
      request.setValue("Widget " + (try ProbeVault.read()), forHTTPHeaderField: "Authorization")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONEncoder().encode(action)
      let (data, response) = try await session.data(for: request)
      guard (response as? HTTPURLResponse)?.statusCode == 200,
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], result["id"] as? String == action.id else { throw ProbeFailure(message: "Unconfirmed operation remains pending") }
      try store.acknowledge(action.id)
    }
  }
}
