import { builtinModules } from 'node:module';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import esbuild from 'esbuild';
const testsDir = 'tests';
const outdir = 'tests/.out';
if (!existsSync(testsDir)) {
	process.exit(0);
}
const entryPoints = readdirSync(testsDir)
	.filter((name) => name.endsWith('.test.ts'))
	.map((name) => path.join(testsDir, name));

if (entryPoints.length === 0) {
	process.exit(0);
}

rmSync(outdir, { recursive: true, force: true });

await esbuild.build({
	entryPoints,
	bundle: true,
	platform: 'node',
	format: 'esm',
	outbase: testsDir,
	outdir,
	external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`), 'yaml'],
	logLevel: 'info',
});

const files = readdirSync(outdir)
	.filter((name) => name.endsWith('.test.js'))
	.map((name) => path.join(outdir, name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
