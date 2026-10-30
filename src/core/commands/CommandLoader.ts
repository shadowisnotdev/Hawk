import { readdir, stat, unlink } from 'node:fs/promises';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CommandDefinition } from '../../types/command.js';
import { registerCommand } from './CommandRegistry.js';
import { consoleLog } from '../logging/ConsoleLogger.js';

export async function loadCommands(modulesDir: string, enabledModules?: string[]): Promise<number> {
  let count = 0;
  let moduleDirs: string[];
  try {
    moduleDirs = await readdir(modulesDir);
  } catch {
    consoleLog('warning', 'startup', `Modules directory not found: ${modulesDir}`);
    return 0;
  }

  for (const dir of moduleDirs) {
    if (enabledModules && enabledModules.length > 0 && !enabledModules.includes(dir)) {
      consoleLog('info', 'startup', `Commands skipped for disabled module: ${dir}`);
      continue;
    }

    const modulePath = join(modulesDir, dir);
    const dirStat = await stat(modulePath).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    let files: string[];
    try {
      files = await readdir(modulePath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (file === 'index.ts' || file === 'index.js' || file.endsWith('.d.ts') || file.endsWith('.map')) continue;
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      // Skip non-command helper/handler files starting with '_' or helper suffixes
      const cleanName = file.replace(/\.(ts|js)$/, '');
      if (
        file.startsWith('_') ||
        cleanName.endsWith('UI') ||
        cleanName.endsWith('Utils') ||
        cleanName.endsWith('Util') ||
        cleanName.endsWith('Handler') ||
        cleanName.endsWith('Manager') ||
        cleanName.endsWith('Evaluator') ||
        cleanName.endsWith('Engine') ||
        cleanName.endsWith('Detector') ||
        cleanName.endsWith('Helpers') ||
        cleanName.endsWith('Helper') ||
        cleanName.endsWith('Sanitizer') ||
        cleanName.endsWith('Service') ||
        cleanName.endsWith('Cleaner') ||
        cleanName.endsWith('Panel') ||
        cleanName.endsWith('Modals') ||
        cleanName.endsWith('Scheduler') ||
        cleanName.endsWith('Builder')
      ) {
        continue;
      }

      const filePath = join(modulePath, file);

      // If running from dist/ and src/ exists, verify that the corresponding .ts source still exists
      if (filePath.includes(`${path.sep}dist${path.sep}`) || filePath.includes('/dist/')) {
        const srcPath = filePath.replace(/([/\\])dist([/\\])/, '$1src$2').replace(/\.js$/, '.ts');
        const srcExists = await stat(srcPath).then(s => s.isFile()).catch(() => false);
        if (!srcExists) {
          // Orphaned compiled file from a deleted command - clean it up and skip
          await unlink(filePath).catch(() => {});
          continue;
        }
      }
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const imported = (await import(fileUrl)) as { default?: CommandDefinition | CommandDefinition[] };

        if (!imported.default) {
          consoleLog('warning', 'startup', `No default export in ${filePath}`);
          continue;
        }

        const cmds = Array.isArray(imported.default) ? imported.default : [imported.default];
        for (const cmd of cmds) {
          if (!cmd.name || !cmd.execute) {
            consoleLog('warning', 'startup', `Invalid command in ${filePath}: missing name or execute`);
            continue;
          }
          registerCommand(cmd);
          count++;
        }
      } catch (error) {
        consoleLog('error', 'startup', `Failed to load command file: ${filePath}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return count;
}
