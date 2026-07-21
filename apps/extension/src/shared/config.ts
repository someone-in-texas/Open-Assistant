declare const __DEFAULT_RELAY_ORIGIN__: string;
declare const __BUILD_MODE__: "development" | "production";

export const buildConfig = Object.freeze({
  defaultRelayOrigin: __DEFAULT_RELAY_ORIGIN__,
  mode: __BUILD_MODE__,
  agentEnabled: false,
  telemetryEnabled: false,
});

export type UserSettings = {
  connectionMode: "mock" | "hosted" | "self-hosted" | "native";
  relayOrigin: string;
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
  oidcAuthorizationEndpoint: "https://identity.example.invalid/authorize",
  oidcTokenEndpoint: "https://identity.example.invalid/oauth/token",
  oidcClientId: "open-assistant-firefox",
  oidcAudience: "open-assistant-relay",
  chatGptBridgeEnabled: true,
  blockedOrigins: [],
};

export async function getSettings(): Promise<UserSettings> {
  const stored = await browser.storage.local.get("settings");
  return { ...defaultSettings, ...(stored.settings as Partial<UserSettings> | undefined) };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await browser.storage.local.set({ settings });
}
