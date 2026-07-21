import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import type { RelayConfig } from "./config.js";

export type Identity = { subject: string; issuer: string };

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw Object.assign(new Error("Authentication required."), { statusCode: 401 });
  return header.slice(7);
}

export function createAuthenticator(config: RelayConfig) {
  const jwks = config.OPEN_ASSISTANT_OIDC_ISSUER
    ? createRemoteJWKSet(new URL(".well-known/jwks.json", config.OPEN_ASSISTANT_OIDC_ISSUER))
    : undefined;
  return async (request: FastifyRequest): Promise<Identity> => {
    const token = bearer(request);
    if (config.OPEN_ASSISTANT_AUTH_MODE === "development") {
      if (token !== "development-token")
        throw Object.assign(new Error("Invalid development token."), { statusCode: 401 });
      return { subject: "local-developer", issuer: "local" };
    }
    if (!jwks || !config.OPEN_ASSISTANT_OIDC_ISSUER || !config.OPEN_ASSISTANT_OIDC_AUDIENCE)
      throw new Error("OIDC is not configured.");
    const verified = await jwtVerify(token, jwks, {
      issuer: config.OPEN_ASSISTANT_OIDC_ISSUER,
      audience: config.OPEN_ASSISTANT_OIDC_AUDIENCE,
      algorithms: ["RS256", "ES256", "EdDSA"],
    });
    if (!verified.payload.sub)
      throw Object.assign(new Error("Token subject is missing."), { statusCode: 401 });
    return {
      subject: verified.payload.sub,
      issuer: verified.payload.iss ?? config.OPEN_ASSISTANT_OIDC_ISSUER,
    };
  };
}
