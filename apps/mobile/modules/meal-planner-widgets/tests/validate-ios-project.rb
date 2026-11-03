require 'xcodeproj'
require 'json'
project=Xcodeproj::Project.open(ARGV.fetch(0))
app=project.targets.find { |target| target.product_type=='com.apple.product-type.application' }
widgets=project.targets.select { |target| target.name=='MealPlannerWidgets' }
abort 'Expected one widget extension' unless app && widgets.length==1
widget=widgets.first
abort 'Extension module must not shadow the Expo bridge' unless widget.build_configurations.all? { |config| config.build_settings['PRODUCT_MODULE_NAME']=='MealPlannerHomeWidgets' }
sources=widget.source_build_phase.files_references.map(&:path)
abort 'Extension sources are missing or duplicated' unless sources.sort==['MealPlannerWidgetCore.swift','MealPlannerWidgets.swift'].sort
embeds=app.copy_files_build_phases.flat_map(&:files_references).count { |file| file==widget.product_reference }
abort 'Expected one embedded extension' unless embeds==1
abort 'Expected one extension dependency' unless app.dependencies.count { |dependency| dependency.target==widget }==1
root=File.dirname(project.path)
appent=app.build_configurations.first.build_settings['CODE_SIGN_ENTITLEMENTS'].delete('"')
extent=widget.build_configurations.first.build_settings['CODE_SIGN_ENTITLEMENTS'].delete('"')
a=Xcodeproj::Plist.read_from_path(File.join(root,appent))
e=Xcodeproj::Plist.read_from_path(File.join(root,extent))
shared=e.fetch('keychain-access-groups')
abort 'Extension must have only one widget-only Keychain group' unless shared.length==1 && shared[0].end_with?('.widgets')
abort 'Default app Keychain group must stay first' unless a.fetch('keychain-access-groups').first!=shared[0] && a['keychain-access-groups'].include?(shared[0])
abort 'Shared App Group mismatch' unless e['com.apple.security.application-groups'].length==1 && a['com.apple.security.application-groups'].include?(e['com.apple.security.application-groups'][0])
puts JSON.generate({extension_targets:widgets.length,extension_sources:sources.length,embedded_extensions:embeds,clerk_group_isolated:true})
