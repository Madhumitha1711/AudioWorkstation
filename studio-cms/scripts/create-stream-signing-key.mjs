#!/usr/bin/env node
// One-off setup helper: calls Cloudflare's API to create a Cloudflare
// Stream *signing key* (there's no dashboard UI for this — see
// https://developers.cloudflare.com/api/resources/stream/subresources/keys/methods/create/)
// and writes the two values studio-backend needs straight into
// ../studio-backend/.env:
//   CLOUDFLARE_STREAM_KEY_ID       <- result.id
//   CLOUDFLARE_STREAM_SIGNING_KEY  <- result.pem, BASE64-DECODED (Cloudflare
//                                     returns this field as a base64 blob
//                                     that itself decodes to the PEM text —
//                                     it is NOT the raw PEM as-is, easy to
//                                     miss since it still "looks like" a
//                                     string), then with the decoded PEM's
//                                     real newlines replaced by literal
//                                     "\n" so it survives as a single .env
//                                     line (dotenv expands "\n" back to a
//                                     real newline for double-quoted
//                                     values when studio-backend reads it —
//                                     see CloudflareStreamTokenService).
//
// Only studio-backend's CloudflareStreamTokenService (src/assets/
// cloudflare-stream-token.service.ts) uses these — they sign the
// short-lived playback tokens that replace the raw Cloudflare Stream
// videoUid in studio-vr's video embeds. See that file's doc comment and
// studio-backend/.env.example for the full picture.
//
// Cloudflare only returns the private key (`pem`) once, at creation time —
// it can't be fetched again later. This script writes it straight to disk
// so it's never pasted into a terminal/chat by hand and never printed to
// stdout.
//
// Usage (from studio-cms/):
//   npm run create:stream-key
//
// Re-running this creates an ADDITIONAL signing key (old ones keep
// working) rather than rotating the existing one — that's fine for first
// setup, but don't run it repeatedly "just in case"; each run leaves a new
// signing key active on your Cloudflare account. To rotate/retire a key,
// use Cloudflare's DELETE /accounts/{account_id}/stream/keys/{key_id}
// endpoint directly.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnvFile(resolve(__dirname, '../.env'));

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const BACKEND_ENV_PATH = resolve(__dirname, '../../studio-backend/.env');

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error(
    'CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_STREAM_API_TOKEN are not set in studio-cms/.env. ' +
      'These are the same credentials already used for video upload (see .env.example) — ' +
      'the same API token needs Stream:Edit permission, which it already has if uploads work.',
  );
  process.exit(1);
}

if (!existsSync(BACKEND_ENV_PATH)) {
  console.error(
    `Expected to find studio-backend/.env at ${BACKEND_ENV_PATH} but it doesn't exist. ` +
      'Copy studio-backend/.env.example to studio-backend/.env first, then re-run this script.',
  );
  process.exit(1);
}

/** Minimal .env reader — avoids depending on a package just for this script. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Sets KEY=value in a .env file's text, replacing an existing line for that key or appending a new one. */
function upsertEnvVar(envText, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(envText)) {
    return envText.replace(pattern, line);
  }
  const withTrailingNewline = envText.endsWith('\n') ? envText : `${envText}\n`;
  return `${withTrailingNewline}${line}\n`;
}

async function main() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/keys`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success || !payload.result) {
    const message = payload?.errors?.map((e) => e.message).join('; ') || response.statusText;
    console.error(`Failed to create Cloudflare Stream signing key: ${message}`);
    process.exit(1);
  }

  const { id, pem: pemBase64 } = payload.result;
  if (!id || !pemBase64) {
    console.error('Cloudflare returned a response without an id/pem — nothing was written.');
    process.exit(1);
  }

  // Cloudflare's `pem` field is base64-encoded PEM text, not the raw PEM
  // text itself — decode it first, then sanity-check it's really an RSA
  // private key before writing anything, so a malformed response fails
  // loudly here instead of surfacing later as a cryptic "secretOrPrivateKey
  // must be an asymmetric key" error out of jsonwebtoken.
  const pem = Buffer.from(pemBase64, 'base64').toString('utf8');
  const { createPrivateKey } = await import('node:crypto');
  try {
    createPrivateKey(pem);
  } catch (error) {
    console.error(`Decoded "pem" doesn't look like a valid private key: ${error.message}`);
    process.exit(1);
  }

  const escapedPem = pem.replace(/\r?\n/g, '\\n');

  let backendEnv = readFileSync(BACKEND_ENV_PATH, 'utf8');
  backendEnv = upsertEnvVar(backendEnv, 'CLOUDFLARE_STREAM_KEY_ID', id);
  backendEnv = upsertEnvVar(backendEnv, 'CLOUDFLARE_STREAM_SIGNING_KEY', `"${escapedPem}"`);
  writeFileSync(BACKEND_ENV_PATH, backendEnv);

  // Round-trip check: re-read what was just written the same way dotenv
  // will (its "\n" -> real-newline expansion only applies to double-quoted
  // values) and confirm it still parses as a private key, so a mistake
  // here fails loudly now instead of showing up later as a runtime signing
  // error in studio-backend.
  const dotenv = await import('dotenv').catch(() => null);
  if (dotenv) {
    const reparsed = dotenv.parse(readFileSync(BACKEND_ENV_PATH, 'utf8'));
    createPrivateKey(reparsed.CLOUDFLARE_STREAM_SIGNING_KEY);
  }

  console.log(`Created Cloudflare Stream signing key ${id}.`);
  console.log(`Wrote CLOUDFLARE_STREAM_KEY_ID and CLOUDFLARE_STREAM_SIGNING_KEY to ${BACKEND_ENV_PATH}.`);
  console.log('Restart studio-backend for it to pick up the new values.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
