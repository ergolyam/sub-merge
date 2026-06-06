import { createServer } from "node:http";

import { createApp } from "./src/server/app.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
}

const server = createServer(createApp());
let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) {
        console.error(`${signal} received during shutdown, forcing exit`);
        process.exit(1);
    }

    isShuttingDown = true;
    console.log(`${signal} received, shutting down`);

    const timeout = setTimeout(() => {
        console.error("Shutdown timed out, forcing exit");
        process.exit(1);
    }, 10000);
    timeout.unref();

    server.close((error) => {
        clearTimeout(timeout);

        if (error) {
            console.error(error);
            process.exit(1);
        }

        console.log("HTTP server closed");
        process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
    console.log(`sub-merge listening on ${host}:${port}`);
});
