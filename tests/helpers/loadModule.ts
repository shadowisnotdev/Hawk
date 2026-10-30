import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

export function loadModule(file: string, dependencies: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const fileUrl = new URL('../../' + file, import.meta.url);
  const require = createRequire(fileUrl);
  const source = readFileSync(fileUrl, 'utf8');
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, process: { env: {} }, console, Buffer, Headers, Request, Response, URL, Date, setTimeout, clearTimeout, setInterval, clearInterval, require: (name: string) => name in dependencies ? dependencies[name] : require(name), ...extra });
  return exports;
}
