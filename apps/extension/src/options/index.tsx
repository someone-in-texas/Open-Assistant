import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultSettings, getSettings, saveSettings, type UserSettings } from "../shared/config.js";

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
  }, []);

  async function persist(): Promise<void> {
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
    await saveSettings(settings);
    setStatus("Settings saved.");
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
            <option value="native">Native companion (BYOK)</option>
          </select>
        </label>
        <label>
          Relay origin
          <input
            value={settings.relayOrigin}
            onChange={(event) => setSettings({ ...settings, relayOrigin: event.target.value })}
          />
        </label>
        {settings.connectionMode !== "mock" && settings.connectionMode !== "native" && (
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
                onChange={(event) => setSettings({ ...settings, oidcClientId: event.target.value })}
              />
            </label>
            <label>
              Relay audience
              <input
                value={settings.oidcAudience}
                onChange={(event) => setSettings({ ...settings, oidcAudience: event.target.value })}
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
