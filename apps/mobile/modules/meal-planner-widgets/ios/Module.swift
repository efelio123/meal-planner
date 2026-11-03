import ExpoModulesCore
import WidgetKit

public class MealPlannerWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MealPlannerWidgets")
    Function("verifySession") { (key:String?) in
      try WidgetStore().verifySession(key)
      Task { await WidgetService.shared.revokeOld() }
    }
    Function("activateScope") { (scope:String?) in
      try WidgetStore().activate(scope)
      Task { await WidgetService.shared.revokeOld() }
    }
    Function("status") { () -> String in try widgetString(WidgetStore().presentation()) }
    AsyncFunction("connect") { (settings:String,token:String,force:Bool) async -> String in
      guard let value=widgetJSON(settings) else { return "{}" }
      await WidgetService.shared.connect(value,token,force)
      return (try? widgetString(WidgetStore().presentation())) ?? "{}"
    }
    AsyncFunction("refresh") { () async -> String in
      await WidgetService.shared.sync()
      return (try? widgetString(WidgetStore().presentation())) ?? "{}"
    }
    AsyncFunction("disable") { (scope:String) async throws -> String in
      try WidgetStore().disable(scope)
      await WidgetService.shared.revokeOld()
      return try widgetString(WidgetStore().presentation())
    }
  }
}
