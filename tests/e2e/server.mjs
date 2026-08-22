import { createServer } from "node:http";
import next from "next";

const app = next({ dev: false, dir: "apps/web" });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => handle(request, response));
server.listen(3000, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
