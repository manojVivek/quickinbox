#!/usr/bin/env bun
// Supply the D1 ID for the upstream deploy command, then restore the template.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const databaseId = process.env.D1_DATABASE_ID?.trim();
if (!databaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
	throw new Error('Set D1_DATABASE_ID to your D1 database UUID in Cloudflare Workers Builds variables.');
}

const root = new URL('..', import.meta.url);
const configPath = new URL('wrangler.jsonc', root);
const original = readFileSync(configPath, 'utf8');
const config = Bun.JSONC.parse(original);
const databases = config.d1_databases?.filter((database) => database.binding === 'DB');
if (databases?.length !== 1) throw new Error('Expected exactly one D1 binding named DB.');
databases[0].database_id = databaseId;

try {
	writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`);
	const result = spawnSync(process.execPath, ['run', 'deploy'], {
		cwd: fileURLToPath(root),
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} finally {
	writeFileSync(configPath, original);
}
