import { readdir, stat, rm } from 'node:fs/promises';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ModuleManifest } from '../../types/module.js';
import { consoleLog } from '../logging/ConsoleLogger.js';

const loadedModules = new Map<string, ModuleManifest>();

export async function loadModuleManifests(modulesDir: string, enabledModules?: string[]): Promise<ModuleManifest[]> {
  loadedModules.clear();

  let dirs: string[];
  try {
    dirs = await readdir(modulesDir);
  } catch {
    consoleLog('warning', 'startup', `Modules directory not found for manifests: ${modulesDir}`);
    return [];
  }

  for (const dir of dirs) {
    // Feature toggle check: if enabledModules is provided, skip dirs not listed
    if (enabledModules && enabledModules.length > 0 && !enabledModules.includes(dir)) {
      consoleLog('info', 'startup', `Module skipped via feature toggle: ${dir}`);
      continue;
    }

    const modulePath = join(modulesDir, dir);
    const dirStat = await stat(modulePath).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    // If running in dist/ and src/ exists, verify that the module folder exists in src/
    if (modulePath.includes(`${path.sep}dist${path.sep}`) || modulePath.includes('/dist/')) {
      const srcDir = modulePath.replace(/([/\\])dist([/\\])/, '$1src$2');
      const srcDirExists = await stat(srcDir).then(s => s.isDirectory()).catch(() => false);
      if (!srcDirExists) {
        // Orphaned module directory from a deleted module (e.g. casino)
        await rm(modulePath, { recursive: true, force: true }).catch(() => {});
        continue;
      }
    }

    // Check for _module.ts or _module.js
    const manifestTs = join(modulePath, '_module.ts');
    const manifestJs = join(modulePath, '_module.js');

    const hasTs = await stat(manifestTs).then(s => s.isFile()).catch(() => false);
    const hasJs = await stat(manifestJs).then(s => s.isFile()).catch(() => false);

    const manifestFile = hasTs ? manifestTs : hasJs ? manifestJs : null;
    if (!manifestFile) continue;

    try {
      const fileUrl = pathToFileURL(manifestFile).href;
      const imported = (await import(fileUrl)) as { default?: ModuleManifest };
      const manifest = imported.default;

      if (!manifest || !manifest.name) {
        consoleLog('warning', 'startup', `Invalid manifest in ${manifestFile}: missing default export or name`);
        continue;
      }

      loadedModules.set(manifest.name, manifest);
      consoleLog('info', 'startup', `Loaded module manifest: ${manifest.name}`);
    } catch (error) {
      consoleLog('error', 'startup', `Failed to load module manifest: ${manifestFile}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Array.from(loadedModules.values());
}

export function getLoadedModules(): ModuleManifest[] {
  return Array.from(loadedModules.values());
}

export function getModuleManifest(name: string): ModuleManifest | undefined {
  return loadedModules.get(name);
}
