import { builtinModules } from 'node:module';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import esbuild from 'esbuild';
import { writeBundledTemplates } from './bundle-templates.mjs';

writeBundledTemplates();

const testsDir = 'tests';
const outdir = 'tests/.out';
const entryPoints = readdirSync(testsDir)
	.filter((name) => name.endsWith('.test.ts'))
	.map((name) => path.join(testsDir, name));

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
