import { z } from "zod";
import { getSettings } from "../shared/config.js";

let accessToken: string | undefined;
let expiresAt = 0;

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1).max(8_192),
    token_type: z.string().toLowerCase().pipe(z.literal("bearer")),
    expires_in: z.number().int().min(60).max(86_400),
  })
  .passthrough();

function secureEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("OIDC endpoints must use HTTPS without embedded credentials or fragments.");
  }
  return url;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function signIn(): Promise<{ expiresAt: string }> {
  const settings = await getSettings();
  const authorization = secureEndpoint(settings.oidcAuthorizationEndpoint);
  const tokenEndpoint = secureEndpoint(settings.oidcTokenEndpoint);
  if (!settings.oidcClientId || !settings.oidcAudience)
    throw new Error("OIDC client and audience are required.");
  const origins = [`${authorization.origin}/*`, `${tokenEndpoint.origin}/*`];
  if (!(await browser.permissions.contains({ origins }))) {
    const granted = await browser.permissions.request({ origins });
    if (!granted) throw new Error("Identity-provider access was denied.");
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const redirectUri = browser.identity.getRedirectURL();
  authorization.search = new URLSearchParams({
    response_type: "code",
    client_id: settings.oidcClientId,
    redirect_uri: redirectUri,
    scope: "openid profile",
    audience: settings.oidcAudience,
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  const redirected = await browser.identity.launchWebAuthFlow({
    url: authorization.href,
    interactive: true,
  });
  if (!redirected) throw new Error("The identity provider did not return a redirect.");
  const result = new URL(redirected);
  if (result.searchParams.get("state") !== state) throw new Error("OIDC state validation failed.");
  const code = result.searchParams.get("code");
  if (!code) throw new Error("The identity provider did not return an authorization code.");
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.oidcClientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}.`);
  const token = tokenResponseSchema.parse(await response.json());
  accessToken = token.access_token;
  expiresAt = Date.now() + (token.expires_in - 30) * 1_000;
  return { expiresAt: new Date(expiresAt).toISOString() };
}

export function signOut(): void {
  accessToken = undefined;
  expiresAt = 0;
}

export function authStatus(): { authenticated: boolean; expiresAt?: string } {
  if (!accessToken || Date.now() >= expiresAt) {
    signOut();
    return { authenticated: false };
  }
  return { authenticated: true, expiresAt: new Date(expiresAt).toISOString() };
}

export function getAccessToken(): string | undefined {
  return authStatus().authenticated ? accessToken : undefined;
}
