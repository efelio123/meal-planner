require 'xcodeproj'
require 'fileutils'
require 'uri'
root = File.expand_path(__dir__)
project_path = File.join(root, 'NativeWidgetProbe.xcodeproj')
abort 'Probe project already exists; preserve and review instead of overwriting' if File.exist?(project_path)
# Team is read locally from the working project; never stored in repository source.
working_path = ARGV.fetch(0) { abort 'Pass the existing working .xcodeproj path; it is inspected read-only.' }
working = Xcodeproj::Project.open(working_path)
team = working.targets.first.build_configurations.first.build_settings['DEVELOPMENT_TEAM']
abort 'Working Personal Team is not configured' if team.to_s.empty?
fixture_origin = ARGV[1]
if fixture_origin
  uri = URI.parse(fixture_origin)
  abort 'Phone fixture must be HTTPS without credentials, query or fragment' unless uri.is_a?(URI::HTTPS) && uri.host && !uri.userinfo && !uri.query && !uri.fragment
end
project = Xcodeproj::Project.new(project_path)
app = project.new_target(:application, 'NativeWidgetProbe', :ios, '17.0')
widget = project.new_target(:app_extension, 'ProbeWidget', :ios, '17.0')
tests = project.new_target(:unit_test_bundle, 'ProbeTests', :ios, '17.0')
app.add_dependency(widget); tests.add_dependency(app)
embed = app.new_copy_files_build_phase('Embed App Extensions'); embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference)
shared = project.main_group.new_group('Shared')
core = shared.new_file('ProbeCore.swift')
[app,widget,tests].each { |target| target.source_build_phase.add_file_reference(core) }
[[app,'ProbeApp.swift'],[widget,'ProbeWidget.swift'],[tests,'ProbeTests.swift']].each { |target,file| target.source_build_phase.add_file_reference(project.main_group.new_file(file)) }
identifiers = {app => 'com.example.mealplanner.nativewidgetprobe',widget => 'com.example.mealplanner.nativewidgetprobe.widget',tests => 'com.example.mealplanner.nativewidgetprobe.tests'}
group_id = 'group.com.example.mealplanner.nativewidgetprobe'
keychain_group = '$(AppIdentifierPrefix)com.example.mealplanner.nativewidgetprobe.shared'
[app,widget,tests].each do |target|
  info = {'CFBundleName'=>target.name,'CFBundleDisplayName'=>target.name,'CFBundleIdentifier'=>'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleExecutable'=>'$(EXECUTABLE_NAME)','CFBundlePackageType'=> target == app ? 'APPL' : (target == widget ? 'XPC!' : 'BNDL'),'CFBundleVersion'=>'1','CFBundleShortVersionString'=>'0.0.1','ProbeAppGroup'=>group_id,'ProbeKeychainGroup'=>keychain_group,'NSAppTransportSecurity'=>{'NSAllowsArbitraryLoads'=>true}}
  info['ProbeFixtureOrigin'] = fixture_origin if fixture_origin
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
puts 'Separate native probe project generated; working project unchanged.'
