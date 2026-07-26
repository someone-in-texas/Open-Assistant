import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { nativeStatusSchema, type NativeStatus } from "@open-assistant/protocol";
import { defaultSettings, getSettings, saveSettings, type UserSettings } from "../shared/config.js";

type Reply<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

function validateRelay(value: string): string | undefined {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      return "Use HTTPS except for loopback development.";
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      return "Enter an origin only, without credentials or a path.";
    return undefined;
  } catch {
    return "Enter a valid relay origin.";
  }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [status, setStatus] = useState("Loading…");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus>();
  const [apiKey, setApiKey] = useState("");
  const [nativeBusy, setNativeBusy] = useState(false);
  useEffect(() => {
    void Promise.all([getSettings(), browser.permissions.getAll()]).then(([stored, granted]) => {
      setSettings(stored);
      setPermissions(granted.origins ?? []);
      setStatus("Settings loaded.");
    });
    void browser.runtime
      .sendMessage({ type: "AUTH_STATUS", requestId: crypto.randomUUID() })
      .then((reply: { ok?: boolean; data?: { authenticated?: boolean } }) => {
        setAuthenticated(Boolean(reply.ok && reply.data?.authenticated));
      });
    void browser.permissions
      .contains({ permissions: ["nativeMessaging"] })
      .then((granted) => {
        if (granted) return refreshNativeStatus();
      })
      .catch(() => undefined);
  }, []);

  async function request<T>(message: Record<string, unknown>): Promise<T> {
    const reply = (await browser.runtime.sendMessage({
      requestId: crypto.randomUUID(),
      ...message,
    })) as Reply<T>;
    if (!reply.ok) throw new Error(reply.error);
    return reply.data as T;
  }

  async function ensureNativePermission(): Promise<boolean> {
    if (await browser.permissions.contains({ permissions: ["nativeMessaging"] })) return true;
    return browser.permissions.request({ permissions: ["nativeMessaging"] });
  }

  async function refreshNativeStatus(): Promise<void> {
    if (!(await browser.permissions.contains({ permissions: ["nativeMessaging"] }))) {
      setNativeStatus(undefined);
      return;
    }
    const next = await request<unknown>({ type: "NATIVE_STATUS" });
    setNativeStatus(nativeStatusSchema.parse(next));
  }

  async function refreshNativeStatusForUser(): Promise<void> {
    setNativeBusy(true);
    try {
      await refreshNativeStatus();
      setStatus("Native provider status refreshed.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Native companion unavailable.");
    } finally {
      setNativeBusy(false);
    }
  }

  async function persist(): Promise<void> {
    if (settings.connectionMode === "native" || settings.connectionMode === "codex") {
      const granted = await ensureNativePermission();
      if (!granted) {
        setStatus("Native companion access was not granted.");
        return;
      }
    } else {
      const error = validateRelay(settings.relayOrigin);
      if (error) {
        setStatus(error);
        return;
      }
      const origin = `${new URL(settings.relayOrigin).origin}/*`;
      if (!(await browser.permissions.contains({ origins: [origin] }))) {
        const granted = await browser.permissions.request({ origins: [origin] });
        if (!granted) {
          setStatus("Relay access was not granted.");
          return;
        }
      }
    }
    await saveSettings(settings);
    setStatus("Settings saved.");
    if (settings.connectionMode === "native" || settings.connectionMode === "codex") {
      try {
        await refreshNativeStatus();
      } catch (reason) {
        setStatus(reason instanceof Error ? reason.message : "Native companion unavailable.");
      }
    }
  }

  async function revoke(origin: string): Promise<void> {
    await browser.permissions.remove({ origins: [origin] });
    setPermissions((current) => current.filter((item) => item !== origin));
  }

  async function unblock(origin: string): Promise<void> {
    const updated = {
      ...settings,
      blockedOrigins: settings.blockedOrigins.filter((item) => item !== origin),
    };
    setSettings(updated);
    await saveSettings(updated);
    setStatus(`${origin} was removed from the never-include list.`);
  }

  async function authenticate(): Promise<void> {
    await saveSettings(settings);
    const reply = (await browser.runtime.sendMessage({
      type: "SIGN_IN",
      requestId: crypto.randomUUID(),
    })) as { ok: boolean; error?: string };
    if (!reply.ok) {
      setStatus(reply.error ?? "Sign-in failed.");
      return;
    }
    setAuthenticated(true);
    setStatus("Signed in. The short-lived access token is held in memory only.");
  }

  async function disconnect(): Promise<void> {
    await browser.runtime.sendMessage({ type: "SIGN_OUT", requestId: crypto.randomUUID() });
    setAuthenticated(false);
    setStatus("Signed out and cleared the in-memory access token.");
  }

  async function storeKey(): Promise<void> {
    if (!apiKey.startsWith("sk-") || apiKey.length < 20 || apiKey.length > 512) {
      setStatus("Enter a valid OpenAI project API key.");
      return;
    }
    if (!(await ensureNativePermission())) {
      setStatus("Native companion access was not granted.");
      return;
    }
    setNativeBusy(true);
    try {
      await request({ type: "NATIVE_STORE_KEY", apiKey });
      setApiKey("");
      await refreshNativeStatus();
      setStatus("API key stored in the OS credential manager.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not store the API key.");
    } finally {
      setNativeBusy(false);
    }
  }

  async function deleteKey(): Promise<void> {
    setNativeBusy(true);
    try {
      await request({ type: "NATIVE_DELETE_KEY" });
      await refreshNativeStatus();
      setStatus("API key removed from the OS credential manager.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not remove the API key.");
    } finally {
      setNativeBusy(false);
    }
  }

  async function loginCodex(): Promise<void> {
    if (!(await ensureNativePermission())) {
      setStatus("Native companion access was not granted.");
      return;
    }
    setNativeBusy(true);
    setStatus("Complete the OpenAI sign-in in the tab opened by Codex.");
    try {
      const next = await request<unknown>({ type: "CODEX_LOGIN" });
      setNativeStatus(nativeStatusSchema.parse(next));
      setStatus("Signed in through Codex. Credentials remain managed by Codex.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Codex sign-in failed.");
    } finally {
      setNativeBusy(false);
    }
  }

  async function logoutFromCodex(): Promise<void> {
    setNativeBusy(true);
    try {
      const next = await request<unknown>({ type: "CODEX_LOGOUT" });
      setNativeStatus(nativeStatusSchema.parse(next));
      setStatus("Signed out of the dedicated Open Assistant Codex session.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Codex sign-out failed.");
    } finally {
      setNativeBusy(false);
    }
  }

  return (
    <main>
      <h1>Open Assistant settings</h1>
      <p>
        Choose who processes the context you explicitly share. API keys are never stored in
        extension storage.
      </p>
      <div className="settings-grid">
        <label>
          Connection mode
          <select
            value={settings.connectionMode}
            onChange={(event) =>
              setSettings({
                ...settings,
                connectionMode: event.target.value as UserSettings["connectionMode"],
              })
            }
          >
            <option value="mock">Local mock relay</option>
            <option value="hosted">Hosted relay</option>
            <option value="self-hosted">Self-hosted relay</option>
            <option value="native">Private local companion (BYOK)</option>
            <option value="codex">OpenAI sign-in through Codex (experimental)</option>
          </select>
        </label>
        {settings.connectionMode !== "native" && settings.connectionMode !== "codex" && (
          <label>
            Relay origin
            <input
              value={settings.relayOrigin}
              onChange={(event) => setSettings({ ...settings, relayOrigin: event.target.value })}
            />
          </label>
        )}
        {settings.connectionMode !== "mock" &&
          settings.connectionMode !== "native" &&
          settings.connectionMode !== "codex" && (
            <section className="settings-grid" aria-labelledby="oidc-heading">
              <h2 id="oidc-heading">OIDC sign-in</h2>
              <label>
                Authorization endpoint
                <input
                  value={settings.oidcAuthorizationEndpoint}
                  onChange={(event) =>
                    setSettings({ ...settings, oidcAuthorizationEndpoint: event.target.value })
                  }
                />
              </label>
              <label>
                Token endpoint
                <input
                  value={settings.oidcTokenEndpoint}
                  onChange={(event) =>
                    setSettings({ ...settings, oidcTokenEndpoint: event.target.value })
                  }
                />
              </label>
              <label>
                Public client ID
                <input
                  value={settings.oidcClientId}
                  onChange={(event) =>
                    setSettings({ ...settings, oidcClientId: event.target.value })
                  }
                />
              </label>
              <label>
                Relay audience
                <input
                  value={settings.oidcAudience}
                  onChange={(event) =>
                    setSettings({ ...settings, oidcAudience: event.target.value })
                  }
                />
              </label>
              <div className="actions">
                {authenticated ? (
                  <button type="button" onClick={() => void disconnect()}>
                    Sign out
                  </button>
                ) : (
                  <button type="button" onClick={() => void authenticate()}>
                    Sign in with PKCE
                  </button>
                )}
              </div>
            </section>
          )}
        {settings.connectionMode === "native" && (
          <section className="settings-grid" aria-labelledby="byok-heading">
            <h2 id="byok-heading">Private BYOK</h2>
            <p>
              Requests go directly from the signed local companion to the OpenAI Responses API. The
              key is stored only in your OS credential manager.
            </p>
            <label>
              OpenAI model
              <select
                value={settings.nativeModel}
                onChange={(event) => setSettings({ ...settings, nativeModel: event.target.value })}
              >
                <option value="gpt-5.6-luna">GPT-5.6 Luna</option>
                <option value="gpt-5.6-terra">GPT-5.6 Terra</option>
                <option value="gpt-5.6-sol">GPT-5.6 Sol</option>
              </select>
            </label>
            <label>
              OpenAI project API key
              <input
                type="password"
                value={apiKey}
                maxLength={512}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                disabled={nativeBusy || !apiKey}
                onClick={() => void storeKey()}
              >
                Store in credential manager
              </button>
              <button
                type="button"
                disabled={nativeBusy || !nativeStatus?.byok.keyStored}
                onClick={() => void deleteKey()}
              >
                Remove stored key
              </button>
              <button
                type="button"
                disabled={nativeBusy}
                onClick={() => void refreshNativeStatusForUser()}
              >
                Refresh status
              </button>
            </div>
            <p className="status">
              Key status: {nativeStatus?.byok.keyStored ? "stored" : "not stored or unavailable"}.
            </p>
          </section>
        )}
        {settings.connectionMode === "codex" && (
          <section className="settings-grid" aria-labelledby="codex-heading">
            <h2 id="codex-heading">OpenAI sign-in through Codex</h2>
            <p>
              Experimental. The local companion starts a locked-down Codex app-server over stdio.
              Codex owns the browser login, credential storage, refresh, and subscription limits.
            </p>
            <label>
              Codex model override
              <input
                value={settings.codexModel}
                maxLength={128}
                placeholder="Leave blank to use the Codex account default"
                onChange={(event) => setSettings({ ...settings, codexModel: event.target.value })}
              />
            </label>
            <div className="actions">
              {nativeStatus?.codex.authenticated && nativeStatus.codex.authMode === "chatgpt" ? (
                <button type="button" disabled={nativeBusy} onClick={() => void logoutFromCodex()}>
                  Sign out
                </button>
              ) : (
                <button type="button" disabled={nativeBusy} onClick={() => void loginCodex()}>
                  Sign in with OpenAI
                </button>
              )}
              <button
                type="button"
                disabled={nativeBusy}
                onClick={() => void refreshNativeStatusForUser()}
              >
                Refresh status
              </button>
            </div>
            <p className="status">
              Codex: {nativeStatus?.codex.available ? nativeStatus.codex.version : "not available"}.
              Account:{" "}
              {nativeStatus?.codex.authenticated
                ? `${nativeStatus.codex.email ?? "signed in"} · ${nativeStatus.codex.planType ?? "unknown plan"}`
                : "not signed in"}
              .
            </p>
            {nativeStatus?.codex.primaryRateLimit && (
              <p className="status">
                Primary limit used: {nativeStatus.codex.primaryRateLimit.usedPercent}%.
              </p>
            )}
          </section>
        )}
        <label>
          <input
            type="checkbox"
            checked={settings.chatGptBridgeEnabled}
            onChange={(event) =>
              setSettings({ ...settings, chatGptBridgeEnabled: event.target.checked })
            }
          />{" "}
          Enable reviewed ChatGPT tab handoff
        </label>
        <button type="button" className="primary" onClick={() => void persist()}>
          Save
        </button>
        <p role="status">{status}</p>
        <section>
          <h2>Granted site access</h2>
          {permissions.length === 0 ? (
            <p>None.</p>
          ) : (
            permissions.map((origin) => (
              <p key={origin}>
                <code>{origin}</code>{" "}
                <button type="button" onClick={() => void revoke(origin)}>
                  Revoke
                </button>
              </p>
            ))
          )}
        </section>
        <section>
          <h2>Experimental agent</h2>
          <p>
            The interactive tab agent is compiled off in production until the independent safety
            release gate is complete.
          </p>
        </section>
        <section>
          <h2>Never-include origins</h2>
          {settings.blockedOrigins.length === 0 ? (
            <p>None.</p>
          ) : (
            settings.blockedOrigins.map((origin) => (
              <p key={origin}>
                <code>{origin}</code>{" "}
                <button type="button" onClick={() => void unblock(origin)}>
                  Allow again
                </button>
              </p>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Options root is missing.");
createRoot(root).render(<App />);
