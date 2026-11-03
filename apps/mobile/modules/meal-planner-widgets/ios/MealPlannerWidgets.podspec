Pod::Spec.new do |s|
  s.name = 'MealPlannerWidgets'
  s.version = '1.0.0'
  s.summary = 'Meal Planner native widget bridge'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Meal Planner'
  s.homepage = 'https://expo.dev'
  # The bridge matches the app minimum; the interactive extension separately targets 17.
  s.platform = :ios, '16.4'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'Module.swift', 'WidgetCore.swift'
  s.frameworks = 'Security', 'WidgetKit'
  s.libraries = 'sqlite3'
  s.swift_version = '5.0'
end
