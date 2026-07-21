import { createRoot } from "react-dom/client";

function App() {
  return (
    <main>
      <h1>Welcome to Open Assistant for Firefox</h1>
      <p>
        Ask questions about pages you choose, review exactly what will be shared, and apply writing
        edits only after approving a diff.
      </p>
      <section>
        <h2>Your control comes first</h2>
        <ul>
          <li>No page is uploaded in the background.</li>
          <li>Site access is requested when you add that origin.</li>
          <li>Conversation messages stay local by default.</li>
          <li>Telemetry is off.</li>
          <li>Agent interaction is disabled until its security gate passes.</li>
        </ul>
      </section>
      <section>
        <h2>Processing</h2>
        <p>
          When you send a request, your prompt and approved page excerpts go to your configured
          relay and, in hosted mode, the OpenAI API. Do not share secrets or sensitive personal
          data.
        </p>
      </section>
      <p>
        <strong>
          This independent open-source project is not affiliated with or endorsed by OpenAI.
        </strong>
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => void browser.sidebarAction.open().then(() => window.close())}
        >
          Open the sidebar
        </button>
        <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>
          Configure connection
        </button>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Onboarding root is missing.");
createRoot(root).render(<App />);
