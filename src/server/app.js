import { readFileSync } from "node:fs";

import { getFetchRetryAttempts, getFetchTimeoutMs, getSubSuffixes, getUpstreams } from "./config.js";
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
    const fetchTimeoutMs = options.fetchTimeoutMs || getFetchTimeoutMs(env, DEFAULT_FETCH_TIMEOUT_MS);
    const fetchRetryAttempts = options.fetchRetryAttempts || getFetchRetryAttempts(env);

    if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required");
    }

    return async function app(request, response) {
        try {
            await routeRequest(request, response, { env, fetchImpl, fetchTimeoutMs, fetchRetryAttempts });
        } catch (error) {
            returnNotFound(response, request, "Unhandled request error", error);
        }
    };
}

async function routeRequest(request, response, options) {
    const url = new URL(request.url || "/", "http://localhost");
    const pathSegments = getPathSegments(url.pathname);

    if (isFavicon(pathSegments)) {
        returnNotFound(response, request);
        return;
    }

    const asset = getAsset(pathSegments);

    if (asset && (request.method === "GET" || request.method === "HEAD")) {
        send(response, request, 200, asset.body, {
            "Content-Type": asset.contentType,
        });
        return;
    }

    await handleMerge(request, response, pathSegments, options);
}

async function handleMerge(request, response, pathSegments, options) {
    const subId = getSubId(pathSegments);

    if (subId === null) {
        returnNotFound(response, request, "Invalid subscription path");
        return;
    }

    const upstreams = getUpstreams(options.env);
    const subSuffixes = getSubSuffixes(options.env);

    if (upstreams.length === 0) {
        returnNotFound(response, request, "UPSTREAMS is empty");
        return;
    }

    const merged = await mergeSubscriptions(subId, upstreams, {
        fetchImpl: options.fetchImpl,
        logger: logError,
        retryAttempts: options.fetchRetryAttempts,
        subSuffixes,
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

function getPathSegments(pathname) {
    return pathname.split("/").filter(Boolean);
}

function getSubId(pathSegments) {
    if (pathSegments.length !== 1) {
        return null;
    }

    return decodePathSegment(pathSegments[0]);
}

function isFavicon(pathSegments) {
    return pathSegments.length === 1 && pathSegments[0] === "favicon.ico";
}

function decodePathSegment(segment) {
    try {
        const decoded = decodeURIComponent(segment);
        return decoded.trim() === "" ? null : decoded;
    } catch (error) {
        return segment.trim() === "" ? null : segment;
    }
}

function getAsset(pathSegments) {
    if (pathSegments.length !== 2 || pathSegments[0] !== "assets") {
        return null;
    }

    return ASSETS[pathSegments[1]] || null;
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
