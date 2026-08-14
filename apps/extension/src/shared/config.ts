declare const __DEFAULT_RELAY_ORIGIN__: string;
declare const __BUILD_MODE__: "development" | "production";

export const buildConfig = Object.freeze({
  defaultRelayOrigin: __DEFAULT_RELAY_ORIGIN__,
  mode: __BUILD_MODE__,
  agentEnabled: false,
  telemetryEnabled: false,
});

export type UserSettings = {
  connectionMode: "mock" | "hosted" | "self-hosted" | "native" | "codex";
  relayOrigin: string;
  nativeModel: string;
  codexModel: string;
  oidcAuthorizationEndpoint: string;
  oidcTokenEndpoint: string;
  oidcClientId: string;
  oidcAudience: string;
  chatGptBridgeEnabled: boolean;
  blockedOrigins: string[];
};

export const defaultSettings: UserSettings = {
  connectionMode: buildConfig.mode === "production" ? "hosted" : "mock",
  relayOrigin: buildConfig.defaultRelayOrigin,
  nativeModel: "gpt-5.6-luna",
  codexModel: "",
  oidcAuthorizationEndpoint: "https://identity.example.invalid/authorize",
  oidcTokenEndpoint: "https://identity.example.invalid/oauth/token",
  oidcClientId: "open-assistant-firefox",
  oidcAudience: "open-assistant-relay",
  chatGptBridgeEnabled: true,
  blockedOrigins: [],
};

export async function getSettings(): Promise<UserSettings> {
  const stored = await browser.storage.local.get("settings");
  const settings = {
    ...defaultSettings,
    ...(stored.settings as Partial<UserSettings> | undefined),
  };
  return settings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await browser.storage.local.set({ settings });
}

const providerSettingKeys = [
  "connectionMode",
  "relayOrigin",
  "nativeModel",
  "codexModel",
  "oidcAuthorizationEndpoint",
  "oidcTokenEndpoint",
  "oidcClientId",
  "oidcAudience",
] as const;

export function providerConnectionChanged(
  before?: Partial<UserSettings>,
  after?: Partial<UserSettings>,
): boolean {
  return providerSettingKeys.some((key) => before?.[key] !== after?.[key]);
}

export function connectionLabel(settings: UserSettings): string {
  switch (settings.connectionMode) {
    case "native":
      return `Private BYOK · ${settings.nativeModel}`;
    case "codex":
      return settings.codexModel
        ? `Codex subscription · ${settings.codexModel}`
        : "Codex subscription · account default";
    case "hosted":
      return "Hosted relay";
    case "self-hosted":
      return "Self-hosted relay";
    case "mock":
      return "Local mock relay";
  }
}
