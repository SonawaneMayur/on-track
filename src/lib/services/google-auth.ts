// Google OAuth 2.0 for installed apps — Authorization Code + PKCE, no client
// secret, no backend. This is the only auth path Google supports that lets a
// pure on-device app obtain an *offline* refresh token without embedding a
// secret. Native-only: the system browser handles consent and a custom URL
// scheme returns the code to the app.
//
// BUILD.md originally dropped OAuth; this is an explicit, opt-in addition that
// sits ALONGSIDE the ICS feeds. The refresh token is a credential and lives in
// the Keychain/Keystore (securestore), never in plain settings.
import { Capacitor } from '@capacitor/core';
import { getFeedUrl, setFeedUrl, deleteFeedUrl } from './securestore';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'];

export class GoogleAuthError extends Error {}

export function googleAuthSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/** Reversed-client-id custom scheme that Google's iOS/Android app clients use. */
export function redirectUriFor(clientId: string): string {
  const head = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${head}:/oauth2redirect`;
}

// ---- PKCE helpers ---------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// ---- Token credential storage (refresh token = secret) --------------------

function refreshKey(accountId: string): string {
  return `google:refresh:${accountId}`;
}

export async function getRefreshToken(accountId: string): Promise<string | null> {
  return getFeedUrl(refreshKey(accountId)); // securestore is generic key/value
}

async function saveRefreshToken(accountId: string, token: string): Promise<void> {
  await setFeedUrl(refreshKey(accountId), token);
}

export async function forgetAccount(accountId: string): Promise<void> {
  await deleteFeedUrl(refreshKey(accountId));
}

// ---- Token responses ------------------------------------------------------

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

export interface AccessToken {
  token: string;
  expiresAt: number; // epoch ms
}

interface IdClaims {
  sub: string;
  email?: string;
}

function decodeIdToken(idToken: string): IdClaims {
  const payload = idToken.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as IdClaims;
}

// ---- The interactive sign-in flow -----------------------------------------

export interface SignInResult {
  accountId: string;
  email: string;
  access: AccessToken;
}

/**
 * Run the one-time consent flow. Opens Google in an in-app browser, waits for
 * the custom-scheme redirect, exchanges the code, and persists the refresh
 * token. Returns identity + a live access token.
 */
export async function signIn(clientId: string): Promise<SignInResult> {
  if (!googleAuthSupported()) {
    throw new GoogleAuthError('Google sign-in is only available on the iOS/Android app.');
  }
  const { Browser } = await import('@capacitor/browser');
  const { App } = await import('@capacitor/app');

  const verifier = randomVerifier();
  const challenge = await challengeOf(verifier);
  const state = randomVerifier().slice(0, 24);
  const redirectUri = redirectUriFor(clientId);

  const url =
    `${AUTH_ENDPOINT}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    let done = false;
    const sub = App.addListener('appUrlOpen', (data) => {
      if (!data.url || !data.url.startsWith('com.googleusercontent.apps.')) return;
      const u = new URL(data.url);
      const returnedState = u.searchParams.get('state');
      const err = u.searchParams.get('error');
      const c = u.searchParams.get('code');
      done = true;
      void sub.then((h) => h.remove());
      void Browser.close();
      if (err) reject(new GoogleAuthError(`Google denied access: ${err}`));
      else if (returnedState !== state) reject(new GoogleAuthError('State mismatch — aborted.'));
      else if (c) resolve(c);
      else reject(new GoogleAuthError('No authorization code returned.'));
    });
    Browser.open({ url, presentationStyle: 'popover' }).catch(reject);
    // Safety timeout in case the user backs out of the browser.
    setTimeout(() => {
      if (!done) {
        void sub.then((h) => h.remove());
        reject(new GoogleAuthError('Sign-in timed out.'));
      }
    }, 180_000);
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!res.ok) throw new GoogleAuthError(`Token exchange failed: ${res.status} ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;

  if (!tokens.id_token) throw new GoogleAuthError('No id_token returned.');
  const claims = decodeIdToken(tokens.id_token);
  if (!tokens.refresh_token) {
    throw new GoogleAuthError(
      'Google did not return a refresh token. Revoke the app at myaccount.google.com → Security → Third-party access and try again.',
    );
  }
  await saveRefreshToken(claims.sub, tokens.refresh_token);

  return {
    accountId: claims.sub,
    email: claims.email ?? 'Google account',
    access: { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 },
  };
}

/** Silently exchange the stored refresh token for a fresh access token. */
export async function getAccessToken(clientId: string, accountId: string): Promise<AccessToken> {
  const refresh = await getRefreshToken(accountId);
  if (!refresh) throw new GoogleAuthError('Not connected — please sign in again.');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (res.status === 400 || res.status === 401) {
    // Refresh token revoked/expired — force re-consent next time.
    throw new GoogleAuthError('Google session expired — please reconnect.');
  }
  if (!res.ok) throw new GoogleAuthError(`Token refresh failed: ${res.status}`);
  const tokens = (await res.json()) as TokenResponse;
  return { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
}
