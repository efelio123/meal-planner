require 'xcodeproj'
require 'fileutils'
require 'uri'
source = File.expand_path('..', __dir__)
root = File.expand_path(ARGV.fetch(0) { abort 'Pass a new empty disposable directory.' })
abort 'Refusing to overwrite a nonempty directory' if Dir.exist?(root) && !Dir.children(root).empty?
FileUtils.mkdir_p(root)
FileUtils.cp(File.join(source,'ios/WidgetCore.swift'), File.join(root,'WidgetCore.swift'))
FileUtils.cp(File.join(source,'ios/Widgets.swift'), File.join(root,'Widgets.swift'))
FileUtils.cp(File.join(__dir__,'WidgetStoreTests.swift'), File.join(root,'WidgetStoreTests.swift'))
File.write(File.join(root,'ProbeApp.swift'), 'import SwiftUI; @main struct ValidationHost:App { var body:some Scene { WindowGroup { Text("Widget storage validation") } } }')
project_path = File.join(root, 'NativeWidgetProbe.xcodeproj')
abort 'Probe project already exists; preserve and review instead of overwriting' if File.exist?(project_path)
# Disposable simulator validation never opens the working consumer project.
team='VALIDATION'
project = Xcodeproj::Project.new(project_path)
app = project.new_target(:application, 'NativeWidgetProbe', :ios, '17.0')
widget = project.new_target(:app_extension, 'ProbeWidget', :ios, '17.0')
tests = project.new_target(:unit_test_bundle, 'ProbeTests', :ios, '17.0')
app.add_dependency(widget); tests.add_dependency(app)
embed = app.new_copy_files_build_phase('Embed App Extensions'); embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference)
shared = project.main_group.new_group('Shared')
core = shared.new_file('WidgetCore.swift')
[app,widget,tests].each { |target| target.source_build_phase.add_file_reference(core) }
[[app,'ProbeApp.swift'],[widget,'Widgets.swift'],[tests,'WidgetStoreTests.swift']].each { |target,file| target.source_build_phase.add_file_reference(project.main_group.new_file(file)) }
identifiers = {app => 'com.example.mealplanner.widgetintegration',widget => 'com.example.mealplanner.widgetintegration.widget',tests => 'com.example.mealplanner.widgetintegration.tests'}
group_id = 'group.com.example.mealplanner.widgetintegration'
keychain_group = '$(AppIdentifierPrefix)com.example.mealplanner.widgetintegration.shared'
[app,widget,tests].each do |target|
  info = {'CFBundleName'=>target.name,'CFBundleDisplayName'=>target.name,'CFBundleIdentifier'=>'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleExecutable'=>'$(EXECUTABLE_NAME)','CFBundlePackageType'=> target == app ? 'APPL' : (target == widget ? 'XPC!' : 'BNDL'),'CFBundleVersion'=>'1','CFBundleShortVersionString'=>'0.0.1','MealPlannerWidgetAppGroup'=>group_id,'MealPlannerWidgetKeychainGroup'=>keychain_group}
  info['MealPlannerWidgetScheme']='mealplanner'
  if target == widget
    info['NSExtension'] = {'NSExtensionPointIdentifier'=>'com.apple.widgetkit-extension'}
  elsif target == app
    info['UILaunchScreen'] = {}; info['UIApplicationSceneManifest'] = {'UIApplicationSupportsMultipleScenes'=>false}
  end
  Xcodeproj::Plist.write_to_path(info, File.join(root,target.name+'.plist'))
  ent = {'com.apple.security.application-groups'=>[group_id],'keychain-access-groups'=>[keychain_group]}
  Xcodeproj::Plist.write_to_path(ent, File.join(root,target.name+'.entitlements'))
  target.build_configurations.each do |cfg|
    cfg.build_settings['SWIFT_VERSION']='5.0'
    cfg.build_settings['OTHER_LDFLAGS']=['$(inherited)','-lsqlite3']
    cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER']=identifiers[target]
    cfg.build_settings['INFOPLIST_FILE']=target.name+'.plist'
    cfg.build_settings['CODE_SIGN_ENTITLEMENTS']=target.name+'.entitlements'
    cfg.build_settings['CODE_SIGN_STYLE']='Automatic'
    cfg.build_settings['DEVELOPMENT_TEAM']=team
    cfg.build_settings['TARGETED_DEVICE_FAMILY']='1,2'
    cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']=['$(inherited)','@executable_path/Frameworks','@executable_path/../../Frameworks']
    cfg.build_settings['GENERATE_INFOPLIST_FILE']='NO'
    cfg.build_settings['SWIFT_EMIT_LOC_STRINGS']='NO'
    cfg.build_settings['SKIP_INSTALL']='YES' if target != app
    cfg.build_settings['TEST_HOST']='$(BUILT_PRODUCTS_DIR)/NativeWidgetProbe.app/NativeWidgetProbe' if target == tests
    cfg.build_settings['BUNDLE_LOADER']='$(TEST_HOST)' if target == tests
  end
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, tests)
scheme.save_as(project_path,'NativeWidgetProbe',true)
puts 'Disposable consumer widget test project generated; working projects untouched.'
