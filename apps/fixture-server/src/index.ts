import { buildFixtureServer } from "./app.js";

const app = await buildFixtureServer();
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.OPEN_ASSISTANT_FIXTURE_PORT ?? 4173),
});
