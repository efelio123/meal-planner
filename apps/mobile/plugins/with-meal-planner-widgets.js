const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist').default;
const { withInfoPlist, withEntitlementsPlist, withXcodeProject, withAndroidManifest, withAppBuildGradle, AndroidConfig } = require('expo/config-plugins');
const targetName = 'MealPlannerWidgets';
const clean = value => typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;

/** App-owned extension only. No SDK fork, Podfile rewrite, project wipe or signing-team literal. */
module.exports = function withMealPlannerWidgets(config) {
  const bundle = config.ios?.bundleIdentifier;
  if (!bundle || !/^[A-Za-z0-9.-]+$/.test(bundle)) throw new Error('A valid app bundle identifier is required for widgets.');
  const group = `group.${bundle}.widgets`;
  const sharedKeychain = `$(AppIdentifierPrefix)${bundle}.widgets`;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!scheme || !/^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme)) throw new Error('Widgets require a valid app URL scheme.');
  config = withInfoPlist(config, result => {
    Object.assign(result.modResults, { MealPlannerWidgetAppGroup: group, MealPlannerWidgetKeychainGroup: sharedKeychain, MealPlannerWidgetScheme: scheme });
    return result;
  });
  config = withEntitlementsPlist(config, result => {
    const ent = result.modResults;
    ent['com.apple.security.application-groups'] = [...new Set([...(ent['com.apple.security.application-groups'] || []), group])];
    // Preserve SecureStore/Clerk's default group first. The extension receives ONLY the widget group.
    const prior = ent['keychain-access-groups'] || [`$(AppIdentifierPrefix)${bundle}`];
    ent['keychain-access-groups'] = [...new Set([...prior, sharedKeychain])];
    return result;
  });
  config = withAndroidManifest(config, result => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    const metadata = application['meta-data'] || (application['meta-data'] = []);
    const existing = metadata.find(entry => entry.$?.['android:name'] === 'MealPlannerWidgetScheme');
    if (existing) existing.$['android:value'] = scheme;
    else metadata.push({ $: { 'android:name': 'MealPlannerWidgetScheme', 'android:value': scheme } });
    return result;
  });
  config = withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Widgets require the Expo Groovy app Gradle template.');
    // Keep java.time available on SDK 58's Android 24/25 minimum without raising it.
    const block = `// @generated begin meal-planner-widget-java-api
android { compileOptions { coreLibraryDesugaringEnabled true } }
dependencies { coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5' }
// @generated end meal-planner-widget-java-api`;
    const pattern = /\/\/ @generated begin meal-planner-widget-java-api[\s\S]*?\/\/ @generated end meal-planner-widget-java-api/g;
    result.modResults.contents = result.modResults.contents.match(pattern)
      ? result.modResults.contents.replace(pattern, block) : result.modResults.contents + '\n' + block + '\n';
    return result;
  });
  config = withXcodeProject(config, result => {
    const project = result.modResults;
    const objects = project.hash.project.objects;
    const root = result.modRequest.platformProjectRoot;
    const directory = path.join(root, targetName);
    fs.mkdirSync(directory, { recursive: true });
    const source = path.join(result.modRequest.projectRoot, 'modules/meal-planner-widgets/ios');
    const sources = [['WidgetCore.swift','MealPlannerWidgetCore.swift'], ['Widgets.swift','MealPlannerWidgets.swift']];
    for (const [from,to] of sources) fs.copyFileSync(path.join(source,from),path.join(directory,to));
    const info = { CFBundleDisplayName: 'Meal Planner', CFBundleName: targetName, CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)', CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundlePackageType: 'XPC!', CFBundleVersion: result.ios?.buildNumber || '1', CFBundleShortVersionString: result.version || '1.0.0', NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' }, MealPlannerWidgetAppGroup: group, MealPlannerWidgetKeychainGroup: sharedKeychain, MealPlannerWidgetScheme: scheme };
    fs.writeFileSync(path.join(directory,'Info.plist'),plist.build(info));
    fs.writeFileSync(path.join(directory,`${targetName}.entitlements`),plist.build({ 'com.apple.security.application-groups': [group], 'keychain-access-groups': [sharedKeychain] }));
    const main = project.getFirstTarget();
    if (clean(main.firstTarget.productType) !== 'com.apple.product-type.application') throw new Error('Widgets require the first native target to be the main application.');
    // node-xcode only creates dependency records when both sections already exist.
    objects.PBXTargetDependency ||= {};
    objects.PBXContainerItemProxy ||= {};
    let entry = Object.entries(objects.PBXNativeTarget || {}).find(([key,value]) => !key.endsWith('_comment') && clean(value.name) === targetName);
    if (!entry) {
      const added = project.addTarget(targetName,'app_extension',targetName,`${bundle}.widgets`);
      entry = [added.uuid,added.pbxNativeTarget];
    }
    const [uuid,target] = entry;
    if (!main.firstTarget.dependencies.some(dependency => clean(objects.PBXTargetDependency[dependency.value]?.target) === uuid)) {
      project.addTargetDependency(main.uuid,[uuid]);
    }
    for (const [type,name] of [['PBXSourcesBuildPhase','Sources'],['PBXFrameworksBuildPhase','Frameworks'],['PBXResourcesBuildPhase','Resources']]) {
      if (!target.buildPhases.some(phase => objects[type]?.[phase.value])) project.addBuildPhase([],type,name,uuid);
    }
    let groupId = project.findPBXGroupKey({ name: targetName });
    if (!groupId) {
      groupId = project.addPbxGroup([],targetName,targetName).uuid;
      project.addToPbxGroup({ fileRef:groupId, basename:targetName },project.getFirstProject().firstProject.mainGroup);
    }
    for (const [,file] of sources) if (!project.hasFile(file)) project.addSourceFile(file,{ target:uuid },groupId);
    const lists = objects.XCConfigurationList;
    const mainConfig = objects.XCBuildConfiguration[lists[clean(main.firstTarget.buildConfigurationList)].buildConfigurations[0].value].buildSettings;
    const team = result.ios?.appleTeamId || clean(mainConfig.DEVELOPMENT_TEAM);
    for (const reference of lists[clean(target.buildConfigurationList)].buildConfigurations) {
      const settings = objects.XCBuildConfiguration[reference.value].buildSettings;
      // Keep the extension module distinct from the CocoaPods/Expo bridge module.
      Object.assign(settings, { PRODUCT_MODULE_NAME:"MealPlannerHomeWidgets", PRODUCT_BUNDLE_IDENTIFIER:`"${bundle}.widgets"`, INFOPLIST_FILE:`"${targetName}/Info.plist"`, CODE_SIGN_ENTITLEMENTS:`"${targetName}/${targetName}.entitlements"`, SWIFT_VERSION:'5.0', IPHONEOS_DEPLOYMENT_TARGET:'17.0', TARGETED_DEVICE_FAMILY:'"1,2"', APPLICATION_EXTENSION_API_ONLY:'YES', GENERATE_INFOPLIST_FILE:'NO', SKIP_INSTALL:'YES', MARKETING_VERSION:result.version || '1.0.0', CURRENT_PROJECT_VERSION:result.ios?.buildNumber || '1', OTHER_LDFLAGS:['"$(inherited)"','"-lsqlite3"'] });
      settings.CODE_SIGN_STYLE ||= 'Automatic';
      if (team) settings.DEVELOPMENT_TEAM ||= team;
    }
    return result;
  });
  return config;
};
