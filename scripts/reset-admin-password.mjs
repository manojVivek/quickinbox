#!/usr/bin/env node
/**
 * Reset a user's password in remote (or local) D1.
 * Usage: bun scripts/reset-admin-password.mjs <email> <password> [--local]
 */
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { subtle } = webcrypto;
const PBKDF2_ITERATIONS = 100_000;

const root = fileURLToPath(new URL('..', import.meta.url));

function toBase64(bytes) {
	return Buffer.from(bytes).toString('base64');
}

async function hashPassword(password) {
	const salt = webcrypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const hash = new Uint8Array(
		await subtle.deriveBits(
			{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
			keyMaterial,
			256
		)
	);
	return `${toBase64(salt)}:${toBase64(hash)}`;
}

const [email, password] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const local = process.argv.includes('--local');

function usage(message) {
	console.error(message);
	console.error('\nUsage: bun scripts/reset-admin-password.mjs <email> <password> [--local]');
	process.exit(1);
}

if (!email?.includes('@')) usage('A valid login email is required.');
if (!password || password.length < 8) usage('Password must be at least 8 characters.');

const passwordHash = await hashPassword(password);
const escape = (value) => value.replace(/'/g, "''");
const sql = `UPDATE users SET password_hash = '${escape(passwordHash)}' WHERE email = '${escape(
	email.toLowerCase()
)}';`;

if (!local) {
	execFileSync('bun', ['scripts/prepare-deploy.mjs'], { stdio: 'inherit', cwd: root });
}
execFileSync(
	'bunx',
	[
		'wrangler',
		'd1',
		'execute',
		'DB',
		local ? '--local' : '--remote',
		...(!local ? ['--config', 'wrangler.deploy.jsonc'] : []),
		'--command',
		sql
	],
	{ stdio: 'inherit', cwd: root }
);

console.log(`\nPassword reset for ${email} (${local ? 'local' : 'remote'} DB).`);
