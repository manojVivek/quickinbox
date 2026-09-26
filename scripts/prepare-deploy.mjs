#!/usr/bin/env bun
/** Generate deployment-only config without changing the tracked template. */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function prepareDeployConfig(root = process.cwd(), env = process.env) {
	const output = join(root, 'wrangler.deploy.jsonc');
	// A failed attempt must not leave an older database selection available.
	rmSync(output, { force: true });
	const config = Bun.JSONC.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
	const bindings = config.d1_databases?.filter((database) => database.binding === 'DB');
	if (bindings?.length !== 1) {
		throw new Error('wrangler.jsonc must contain exactly one D1 binding named DB.');
	}

	const database = bindings[0];
	// Keep existing installs and Deploy to Cloudflare's populated configs working.
	const databaseId = env.D1_DATABASE_ID?.trim() || database.database_id;
	if (typeof databaseId !== 'string' || !UUID.test(databaseId)) {
		throw new Error(
			'Set D1_DATABASE_ID to your D1 database UUID in Cloudflare Workers Builds variables ' +
			'or a local .env file. A Worker runtime secret is not available to the deploy command.'
		);
	}
	database.database_id = databaseId;
	writeFileSync(output, `${JSON.stringify(config, null, '\t')}\n`);
	return output;
}

if (import.meta.main) {
	try {
		prepareDeployConfig();
		console.log('Prepared wrangler.deploy.jsonc for migrations and deployment.');
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
