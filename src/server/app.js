import { readFileSync } from "node:fs";

import { getUpstreams } from "./config.js";
import { isBrowserRequest } from "./headers.js";
import { renderBrowserSubscription } from "./render.js";
import { DEFAULT_FETCH_TIMEOUT_MS, mergeSubscriptions } from "./subscription.js";

const ASSETS = {
    "client.js": {
        body: readFileSync(new URL("../client/client.js", import.meta.url), "utf8"),
        contentType: "application/javascript; charset=utf-8",
    },
    "styles.css": {
        body: readFileSync(new URL("../client/styles.css", import.meta.url), "utf8"),
        contentType: "text/css; charset=utf-8",
    },
};

export function createApp(options = {}) {
    const env = options.env || process.env;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const fetchTimeoutMs = options.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS;

    if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required");
    }

    return async function app(request, response) {
        try {
            await routeRequest(request, response, { env, fetchImpl, fetchTimeoutMs });
        } catch (error) {
            returnNotFound(response, request, "Unhandled request error", error);
        }
    };
}

async function routeRequest(request, response, options) {
    const url = new URL(request.url || "/", "http://localhost");
    const asset = getAsset(url.pathname);

    if (asset && (request.method === "GET" || request.method === "HEAD")) {
        send(response, request, 200, asset.body, {
            "Content-Type": asset.contentType,
        });
        return;
    }

    await handleMerge(request, response, url.pathname, options);
}

async function handleMerge(request, response, pathname, options) {
    const subId = getSubId(pathname);

    if (subId === null) {
        returnNotFound(response, request, `Invalid subscription path: ${pathname}`);
        return;
    }

    const upstreams = getUpstreams(options.env);

    if (upstreams.length === 0) {
        returnNotFound(response, request, "UPSTREAMS is empty");
        return;
    }

    const merged = await mergeSubscriptions(subId, upstreams, {
        fetchImpl: options.fetchImpl,
        logger: logError,
        timeoutMs: options.fetchTimeoutMs,
    });

    if (merged.links.length === 0) {
        returnNotFound(response, request, `No usable links for subscription id: ${subId}`);
        return;
    }

    const plain = merged.links.join("\n") + "\n";

    const commonHeaders = {
        "Cache-Control": "no-store",
    };

    if (isBrowserRequest(request)) {
        send(response, request, 200, renderBrowserSubscription(plain, merged.upstreamStatus), {
            ...commonHeaders,
            "Content-Type": "text/html; charset=utf-8",
        });
        return;
    }

    const encoded = Buffer.from(plain, "utf8").toString("base64");
    send(response, request, 200, encoded, {
        ...commonHeaders,
        "Content-Type": "text/plain; charset=utf-8",
    });
}

function getSubId(pathname) {
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length === 0) {
        return null;
    }

    return decodePathSegment(segments[segments.length - 1]);
}

function decodePathSegment(segment) {
    try {
        const decoded = decodeURIComponent(segment);
        return decoded.trim() === "" ? null : decoded;
    } catch (error) {
        return segment.trim() === "" ? null : segment;
    }
}

function getAsset(pathname) {
    if (!pathname.includes("/assets/")) {
        return null;
    }

    const name = pathname.split("/").pop();
    return ASSETS[name] || null;
}

function returnNotFound(response, request, message, error) {
    if (message) {
        logRequestError(request, message, error);
    }

    send(response, request, 404, "");
}

function logRequestError(request, message, error) {
    const requestLine = `${request.method || "GET"} ${request.url || "/"}`;
    logError(`${message} (${requestLine})`, error);
}

function logError(message, error) {
    if (error) {
        console.error(`[sub-merge] ${message}: ${error.message || error}`);
        return;
    }

    console.error(`[sub-merge] ${message}`);
}

function send(response, request, status, body, headers = {}) {
    const payload = Buffer.from(body, "utf8");

    response.writeHead(status, {
        "Content-Length": String(payload.length),
        ...headers,
    });

    response.end(request.method === "HEAD" ? undefined : payload);
}
