// Executes the pinned SDK JS normalizer/press dispatcher and its Babel-serialized
// layouts. Native view hosts are stubs: these checks cannot prove phone geometry.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const { transformSync } = require('@babel/core');
const preset = expoRequire.resolve('babel-preset-expo');
const sdkRoot = dirname(require.resolve('expo-widgets/package.json'));
const projectRoot = resolve(import.meta.dirname, '..');

export function widgetRuntime(platform) {
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  const modules = new Map(); const registrations = [];
  function jsx(type, props, key) { return { type, key: key ?? props.key ?? null, props }; }
  const hosts = new Proxy({}, { get(_target, name) {
    if (name === '__esModule') return true;
    return (props) => jsx(String(name), { ...props, onButtonPress: props.onPress ?? props.onClick });
  } });
  const modifiers = new Proxy({}, { get(_target, name) { if (name === '__esModule') return true; return (...args) => ({ name: String(name), args }); } });
  function load(file, babel = false) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const source = readFileSync(file, 'utf8');
    const code = babel ? transformSync(source, { filename: file, babelrc: false, configFile: false,
      presets: [[preset, { enableReactCompiler: false }]],
      caller: { name: 'widget-feasibility', platform, supportsStaticESM: false, isDev: false } }).code
      : ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    function localRequire(id) {
      if (id === 'expo-widgets') return { createWidget(name, layout, initialProps) { registrations.push({ name, layout, initialProps }); return { updateSnapshot() {} }; } };
      if (id.startsWith('@expo/ui/')) return id.endsWith('/modifiers') ? modifiers : hosts;
      if (id.startsWith('@babel/runtime/')) return require(id);
      if (id === 'react/jsx-runtime') return load(resolve(sdkRoot, 'bundle/jsx-runtime-stub.ts'));
      if (id === 'react') return load(resolve(sdkRoot, 'bundle/react-stub.ts'));
      if (id.endsWith('/ui-globals') || id === './ui-globals') return { ...Object.fromEntries(['VStack','HStack','Text','Button','Column','Row'].map((key) => [key, hosts[key]])), ...Object.fromEntries(['font','foregroundStyle','background','padding','paddingAll','widgetURL','controlSize'].map((key) => [key, modifiers[key]])) };
      if (id.startsWith('.')) return load(resolve(dirname(file), id + '.ts'));
      throw new Error(`Unexpected module in isolated layout: ${id}`);
    }
    vm.runInContext(`(function(exports, require, module) {${code}\n})`, context, { timeout: 3000 })(module.exports, localRequire, module);
    return module.exports;
  }
  if (process.env.WIDGET_LAB_USE_SDK_BUNDLES === '1') {
    const bundle = readFileSync(resolve(projectRoot, `artifacts/ExpoWidgets-${platform}.bundle`), 'utf8');
    vm.runInContext(bundle, context, { timeout: 5000 });
  } else load(resolve(sdkRoot, 'bundle/index.ts'));
  load(resolve(projectRoot, `src/WidgetLab.${platform}.tsx`), true);
  const sample = registrations.find((entry) => entry.name === (platform === 'ios' ? 'MealPlannerWidgetLab' : 'WidgetLabMedium'));
  if (typeof sample?.layout !== 'string') throw new Error('Expo did not serialize the widget function.');
  vm.runInContext(`globalThis.__expoWidgetLayout = (${sample.layout});`, context, { timeout: 3000 });
  let props = JSON.parse(JSON.stringify(sample.initialProps));
  const environment = { configuration: {}, widgetFamily: 'systemMedium', timestamp: Date.UTC(2026, 10, 2) };
  function render() { return context.__expoWidgetRender(props, environment); }
  function walk(node, result = []) { if (!node || typeof node !== 'object') return result; if (Array.isArray(node)) { node.forEach((child) => walk(child, result)); return result; } result.push(node); walk(node.props?.children, result); return result; }
  function press(label) {
    const button = walk(render()).find((node) => node.type === 'Button' && (node.props?.label === label || node.props?.children === label));
    if (!button) throw new Error(`Button missing: ${label}`);
    const changed = context.__expoWidgetHandlePress(props, { ...environment, target: button.props.target });
    props = JSON.parse(JSON.stringify({ ...props, ...changed }));
    return props;
  }
  return { render, press, environment, props: () => props, globals: (code) => vm.runInContext(code, context), registrations,
    replace: (next) => { props = JSON.parse(JSON.stringify(next)); } };
}
