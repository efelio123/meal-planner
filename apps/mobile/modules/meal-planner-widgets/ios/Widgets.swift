import SwiftUI
import WidgetKit
import AppIntents

struct MealWidgetCheck: AppIntent {
  static var title: LocalizedStringResource = "Check a shopping item"
  static var openAppWhenRun = false
  @Parameter(title:"Binding") var generation:String
  @Parameter(title:"Item") var item:String
  @Parameter(title:"Version") var version:Int
  init() {}
  init(_ generation:String,_ item:String,_ version:Int) { self.generation=generation;self.item=item;self.version=version }
  func perform() async throws -> some IntentResult {
    try? WidgetStore().enqueue(generation,item,version)
    WidgetCenter.shared.reloadAllTimelines()
    await WidgetService.shared.sync()
    return .result()
  }
}
struct MealWidgetRetry: AppIntent {
  static var title: LocalizedStringResource = "Retry pending shopping checkoffs"
  static var openAppWhenRun=false
  func perform() async throws -> some IntentResult { await WidgetService.shared.sync();return .result() }
}
struct MealWidgetView: AppIntent {
  static var title:LocalizedStringResource="Change widget view"
  static var openAppWhenRun=false
  @Parameter(title:"Binding") var generation:String
  @Parameter(title:"View") var mode:String
  @Parameter(title:"Day") var day:Int
  init() {}
  init(_ generation:String,_ mode:String,_ day:Int) { self.generation=generation;self.mode=mode;self.day=day }
  func perform() async throws -> some IntentResult {
    try? WidgetStore().select(generation,mode,day);WidgetCenter.shared.reloadAllTimelines();return .result()
  }
}
struct MealWidgetShoppingPage: AppIntent {
  static var title:LocalizedStringResource="Browse shopping items"
  static var openAppWhenRun=false
  @Parameter(title:"Binding") var generation:String
  @Parameter(title:"Page") var page:Int
  @Parameter(title:"Items per page") var size:Int
  init() {}
  init(_ generation:String,_ page:Int,_ size:Int) { self.generation=generation;self.page=page;self.size=size }
  func perform() async throws -> some IntentResult {
    try? WidgetStore().selectShoppingPage(generation,page,size)
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
struct MealWidgetEntry:TimelineEntry { let date:Date;let state:WidgetJSON }
struct MealWidgetProvider:TimelineProvider {
  func placeholder(in context:Context)->MealWidgetEntry { MealWidgetEntry(date:Date(),state:[:]) }
  func getSnapshot(in context:Context,completion:@escaping(MealWidgetEntry)->Void) {
    completion(MealWidgetEntry(date:Date(),state:(try? WidgetStore().presentation()) ?? [:]))
  }
  func getTimeline(in context:Context,completion:@escaping(Timeline<MealWidgetEntry>)->Void) {
    Task {
      // A timeline refresh must not recursively request another timeline refresh.
      await WidgetService.shared.sync(reload:false)
      let state=(try? WidgetStore().presentation()) ?? [:]
      let config=state["config"] as? WidgetJSON ?? [:]
      let expiry=widgetDate(config["expires_at"]) ?? Date().addingTimeInterval(1800)
      let next=max(Date().addingTimeInterval(60),min(Date().addingTimeInterval(1800),expiry))
      completion(Timeline(entries:[MealWidgetEntry(date:Date(),state:state)],policy:.after(next)))
    }
  }
}
struct MealWidgetContent:View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var appearance
  let entry:MealWidgetEntry
  private var config:WidgetJSON { entry.state["config"] as? WidgetJSON ?? [:] }
  private var snapshot:WidgetJSON { entry.state["snapshot"] as? WidgetJSON ?? [:] }
  private var shopping:WidgetJSON { snapshot["shopping"] as? WidgetJSON ?? [:] }
  private var generation:String { config["generation"] as? String ?? "" }
  private var pending:Int { entry.state["pending_count"] as? Int ?? 0 }
  private var days:[WidgetJSON] { (snapshot["plan"] as? WidgetJSON)?["days"] as? [WidgetJSON] ?? [] }
  private var day:Int { min(6,max(0,entry.state["day"] as? Int ?? 0)) }
  private var scheme:String { Bundle.main.object(forInfoDictionaryKey:"MealPlannerWidgetScheme") as? String ?? "mealplanner" }
  private var shoppingURL:URL { URL(string:scheme+"://shopping")! }
  private var planURL:URL { URL(string:scheme+"://plan")! }
  private func color(_ role:String)->Color {
    let theme=config["theme"] as? WidgetJSON ?? [:]
    let mode=theme[appearance == .dark ? "dark":"light"] as? WidgetJSON ?? [:]
    if let text=mode[role] as? String,text.hasPrefix("#"),text.count==7,let n=UInt64(text.dropFirst(),radix:16) {
      return Color(red:Double((n>>16)&255)/255,green:Double((n>>8)&255)/255,blue:Double(n&255)/255)
    }
    if role=="surface" { return Color(.secondarySystemBackground) }
    if role=="primary" { return .accentColor }
    return role=="textSecondary" ? .secondary:.primary
  }
  private func stamp(_ date:String,_ format:String)->String {
    let parser=DateFormatter();parser.locale=Locale(identifier:"en_US_POSIX");parser.timeZone=TimeZone(identifier:snapshot["time_zone"] as? String ?? "UTC");parser.dateFormat="yyyy-MM-dd"
    guard let value=parser.date(from:date) else { return date }
    let output=DateFormatter();output.timeZone=parser.timeZone;output.dateFormat=format;return output.string(from:value)
  }
  private var pendingItems:Set<String> {
    guard let store=try? WidgetStore(),let config=try? store.context(),let actions=try? store.pending(config) else { return [] }
    return Set(actions.compactMap { $0["item_id"] as? String })
  }
  var body:some View {
    Group {
      if family == .systemSmall {
        VStack(alignment:.leading,spacing:6) {
          Label("Shopping",systemImage:"cart").font(.caption)
          Text(shopping["unpurchased_count"].map { String(describing:$0) } ?? "—").font(.system(size:42,weight:.semibold,design:.rounded))
          Text(snapshot.isEmpty ? "Open Meal Planner":"items to buy").font(.caption)
          if pending>0 { Text("\(pending) pending").font(.caption2).foregroundStyle(color("textSecondary")) }
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
      } else if snapshot.isEmpty {
        VStack(spacing:8) {
          Image(systemName:"house.and.flag").font(.title2)
          Text(entry.state["needs_reconnect"] as? Bool == true ? "Reconnect widgets":"Set up your widgets").font(.headline)
          Link("Open Meal Planner",destination:shoppingURL).font(.caption)
        }
      } else {
        VStack(alignment:.leading,spacing:family == .systemLarge ? 8:5) {
          HStack {
            Text(snapshot["household_name"] as? String ?? "Meal Planner").font(.caption.weight(.semibold)).lineLimit(1)
            Spacer()
            ForEach(["shopping","plan"],id:\.self) { mode in
              Button(intent:MealWidgetView(generation,mode,day)) { Text(mode=="shopping" ? "Shopping":"Plan").font(.caption.weight(entry.state["view"] as? String == mode ? .bold:.regular)) }
                .buttonStyle(.plain).foregroundStyle(color("primary"))
            }
          }
          if entry.state["view"] as? String == "plan" { planView }
          else { shoppingView }
          if entry.state["state"] as? String == "offline" { Text("Offline · showing last update").font(.caption2).foregroundStyle(color("textSecondary")) }
          if entry.state["state"] as? String == "changed" { Text("List changed · showing current items").font(.caption2).foregroundStyle(color("textSecondary")) }
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
      }
    }.foregroundStyle(color("text")).containerBackground(color("surface"),for:.widget)
      .widgetURL(family == .systemSmall ? shoppingURL : entry.state["view"] as? String == "plan" ? planURL:shoppingURL)
  }
  @ViewBuilder private var shoppingView:some View {
    let rows=shopping["items"] as? [WidgetJSON] ?? []
    let limit=family == .systemLarge ? 7:3
    let page=WidgetShoppingPage(items:rows.count,size:limit,requested:entry.state["shopping_page_\(limit)"] as? Int ?? 0)
    let ids=pendingItems
    if rows.isEmpty { Text("Nothing to buy").font(.headline);Spacer(minLength:0) }
    ForEach(Array(rows[page.range].enumerated()),id:\.offset) { _,row in
      let id=row["id"] as? String ?? ""
      let waiting=ids.contains(id)
      HStack(spacing:7) {
        if waiting { Image(systemName:"clock").foregroundStyle(color("textSecondary")) }
        else if snapshot["can_check"] as? Bool == true {
          Button(intent:MealWidgetCheck(generation,id,row["check_version"] as? Int ?? 0)) { Image(systemName:"circle").font(.title3) }.buttonStyle(.plain).foregroundStyle(color("primary")).accessibilityLabel("Check \(row["name"] as? String ?? "item")")
        }
        VStack(alignment:.leading,spacing:0) {
          Text(row["name"] as? String ?? "Item").font(.subheadline).lineLimit(1)
          if family == .systemLarge {
            Text([row["amount"] as? String,row["unit_label"] as? String,row["store_name"] as? String].compactMap{$0}.joined(separator:" · ")).font(.caption2).foregroundStyle(color("textSecondary")).lineLimit(1)
          }
        }
        Spacer(minLength:0)
        if waiting { Text("Pending").font(.caption2).foregroundStyle(color("textSecondary")) }
      }
    }
    Spacer(minLength:0)
    HStack(spacing:6) {
      let count=shopping["unpurchased_count"] as? Int ?? 0
      Link(count>rows.count ? "Open all \(count)":"Open list",destination:shoppingURL).font(.caption2)
      Spacer(minLength:0)
      if pending>0 {
        Button(intent:MealWidgetRetry()) { Text("Retry \(pending)").font(.caption2) }
          .buttonStyle(.plain).accessibilityLabel("Retry \(pending) pending checkoffs")
      }
      if page.count>1 {
        Button(intent:MealWidgetShoppingPage(generation,page.index-1,limit)) {
          Image(systemName:"chevron.left").font(.caption.weight(.semibold)).frame(width:24,height:24)
        }.buttonStyle(.plain).disabled(page.index==0).opacity(page.index==0 ? 0.35:1)
          .accessibilityLabel("Previous shopping page")
        Text("\(page.index+1)/\(page.count)").font(.caption2.monospacedDigit())
          .foregroundStyle(color("textSecondary"))
          .accessibilityLabel("Shopping page \(page.index+1) of \(page.count)")
        Button(intent:MealWidgetShoppingPage(generation,page.index+1,limit)) {
          Image(systemName:"chevron.right").font(.caption.weight(.semibold)).frame(width:24,height:24)
        }.buttonStyle(.plain).disabled(page.index==page.count-1).opacity(page.index==page.count-1 ? 0.35:1)
          .accessibilityLabel("Next shopping page")
      }
    }.foregroundStyle(color("primary"))
  }
  @ViewBuilder private var planView:some View {
    if days.count==7 {
      if family == .systemLarge {
        ForEach(Array(days.enumerated()),id:\.offset) { index,value in
          Button(intent:MealWidgetView(generation,"plan",index)) {
            HStack {
              Text(stamp(value["date"] as? String ?? "","EEE d")).font(.caption.weight(index==day ? .bold:.regular)).frame(width:56,alignment:.leading)
              Text((value["meals"] as? [WidgetJSON] ?? []).compactMap{$0["title"] as? String}.joined(separator:" · ").isEmpty ? "No meals":(value["meals"] as? [WidgetJSON] ?? []).compactMap{$0["title"] as? String}.joined(separator:" · ")).font(.caption2).lineLimit(1)
              Spacer(minLength:0)
            }
          }.buttonStyle(.plain)
        }
        Divider()
      } else {
        HStack {
          ForEach(Array(days.enumerated()),id:\.offset) { index,value in
            Button(intent:MealWidgetView(generation,"plan",index)) { Text(stamp(value["date"] as? String ?? "","EEEEE d")).font(.caption2.weight(index==day ? .bold:.regular)) }.buttonStyle(.plain)
            if index<6 { Spacer(minLength:0) }
          }
        }.foregroundStyle(color("primary"))
      }
      let selected=days[day]
      let meals=selected["meals"] as? [WidgetJSON] ?? []
      Text(stamp(selected["date"] as? String ?? "","EEEE, MMM d")).font(.caption.weight(.semibold))
      ForEach(["breakfast","lunch","dinner"],id:\.self) { slot in
        HStack(alignment:.top,spacing:4) {
          Text(slot.capitalized).foregroundStyle(color("textSecondary"))
          Text(meals.filter{$0["slot"] as? String==slot}.compactMap{$0["title"] as? String}.joined(separator:", ").isEmpty ? "—":meals.filter{$0["slot"] as? String==slot}.compactMap{$0["title"] as? String}.joined(separator:", ")).lineLimit(1)
          Spacer(minLength:0)
        }.font(.caption2)
      }
      Link("Open Plan",destination:planURL).font(.caption2).foregroundStyle(color("primary"))
    }
  }
}
struct MealPlannerWidget:Widget {
  var body:some WidgetConfiguration {
    StaticConfiguration(kind:"MealPlannerWidgets",provider:MealWidgetProvider()) { MealWidgetContent(entry:$0) }
      .configurationDisplayName("Meal Planner").description("Your household shopping list and meals for the week.")
      .supportedFamilies([.systemSmall,.systemMedium,.systemLarge])
  }
}

@main struct MealPlannerWidgetBundle:WidgetBundle { var body:some Widget { MealPlannerWidget() } }
