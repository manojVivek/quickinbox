import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDeployConfig } from './prepare-deploy.mjs';

const template = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const script = fileURLToPath(new URL('./prepare-deploy.mjs', import.meta.url));
const databaseId = '00000000-0000-4000-8000-000000000001';
const previousId = '00000000-0000-4000-8000-000000000002';
const directories = [];

function fixture(source = template) {
	const root = mkdtempSync(join(tmpdir(), 'quickinbox-deploy-test-'));
	directories.push(root);
	writeFileSync(join(root, 'wrangler.jsonc'), source);
	return root;
}

afterEach(() => {
	for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('injects the environment ID without changing the template or other settings', () => {
	const root = fixture();
	const result = JSON.parse(readFileSync(prepareDeployConfig(root, { D1_DATABASE_ID: databaseId }), 'utf8'));
	const expected = Bun.JSONC.parse(template);
	expected.d1_databases[0].database_id = databaseId;
	expect(result).toEqual(expected);
	expect(readFileSync(join(root, 'wrangler.jsonc'), 'utf8')).toBe(template);
});

test('keeps an existing configured ID when no environment override is supplied', () => {
	const root = fixture(template.replace('REPLACE_WITH_YOUR_D1_DATABASE_ID', previousId));
	const result = JSON.parse(readFileSync(prepareDeployConfig(root, {}), 'utf8'));
	expect(result.d1_databases[0].database_id).toBe(previousId);
});

test('an environment override wins over a configured ID and is trimmed', () => {
	const root = fixture(template.replace('REPLACE_WITH_YOUR_D1_DATABASE_ID', previousId));
	const result = JSON.parse(readFileSync(prepareDeployConfig(root, { D1_DATABASE_ID: ` ${databaseId}\n` }), 'utf8'));
	expect(result.d1_databases[0].database_id).toBe(databaseId);
});

test.each([undefined, '', 'quickmail', 'REPLACE_WITH_YOUR_D1_DATABASE_ID'])('rejects a missing or invalid ID (%s) and removes stale output', (value) => {
	const root = fixture();
	const output = join(root, 'wrangler.deploy.jsonc');
	writeFileSync(output, 'stale database config');
	expect(() => prepareDeployConfig(root, { D1_DATABASE_ID: value })).toThrow('Set D1_DATABASE_ID');
	expect(existsSync(output)).toBe(false);
});

test('an invalid override never silently falls back to a different database', () => {
	const root = fixture(template.replace('REPLACE_WITH_YOUR_D1_DATABASE_ID', previousId));
	expect(() => prepareDeployConfig(root, { D1_DATABASE_ID: 'not-a-uuid' })).toThrow('Set D1_DATABASE_ID');
});

test('accepts JSONC and selects DB by binding without changing other databases', () => {
	const root = fixture(`{
		// A second database may appear before the mail database.
		"d1_databases": [
			{ "binding": "OTHER", "database_id": "${previousId}" },
			{ "binding": "DB", "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID" },
		],
		"routes": [{ "pattern": "mail.example.com", "custom_domain": true }],
	}`);
	const result = JSON.parse(readFileSync(prepareDeployConfig(root, { D1_DATABASE_ID: databaseId }), 'utf8'));
	expect(result.d1_databases[0].database_id).toBe(previousId);
	expect(result.d1_databases[1].database_id).toBe(databaseId);
	expect(result.routes[0].pattern).toBe('mail.example.com');
});

test.each([[[]], [[{ binding: 'DB' }, { binding: 'DB' }]]])('rejects absent or ambiguous DB bindings', (bindings) => {
	const root = fixture(JSON.stringify({ d1_databases: bindings }));
	expect(() => prepareDeployConfig(root, { D1_DATABASE_ID: databaseId })).toThrow('exactly one D1 binding');
});

test('the CLI loads local .env configuration and exits unsuccessfully when it is missing', () => {
	const root = fixture();
	const env = { ...process.env };
	delete env.D1_DATABASE_ID;
	const options = { cwd: root, env, encoding: 'utf8' };
	const missing = spawnSync(process.execPath, [script], options);
	expect(missing.status).toBe(1);
	expect(missing.stderr).toContain('Set D1_DATABASE_ID');
	expect(existsSync(join(root, 'wrangler.deploy.jsonc'))).toBe(false);

	writeFileSync(join(root, '.env'), `D1_DATABASE_ID=${databaseId}\n`);
	const configured = spawnSync(process.execPath, [script], options);
	expect(configured.status).toBe(0);
	const result = JSON.parse(readFileSync(join(root, 'wrangler.deploy.jsonc'), 'utf8'));
	expect(result.d1_databases[0].database_id).toBe(databaseId);
	expect(configured.stdout).not.toContain(databaseId);
});
