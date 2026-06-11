export const DEFAULT_FETCH_TIMEOUT_MS = 5000;

export async function mergeSubscriptions(subId, upstreams, options = {}) {
    const subscriptionIds = getSubscriptionIds(subId, options.subSuffixes);
    const upstreamResults = await Promise.all(upstreams.map((baseUrl) => {
        return Promise.all(subscriptionIds.map(async (subscriptionId) => {
            const isOptionalSubscription = subscriptionId !== subId;

            try {
                return {
                    ok: true,
                    text: await fetchSubscription(baseUrl, subscriptionId, {
                        ...options,
                        quietNotFound: isOptionalSubscription,
                    }),
                };
            } catch (error) {
                if (!isQuietNotFound(isOptionalSubscription, error)) {
                    logUpstreamError(options.logger, baseUrl, subscriptionId, error);
                }

                return {
                    ok: false,
                    text: "",
                };
            }
        }));
    }));

    const links = [];
    const seen = new Set();
    const successfulUpstreams = upstreamResults.filter((results) => {
        return results.some((result) => result.ok);
    }).length;

    for (const results of upstreamResults) {
        for (const result of results) {
            for (const link of extractSubscriptionLinks(result.text)) {
                if (!seen.has(link)) {
                    seen.add(link);
                    links.push(link);
                }
            }
        }
    }

    return {
        links,
        upstreamStatus: `${successfulUpstreams}/${upstreams.length}`,
    };
}

function isQuietNotFound(isOptionalSubscription, error) {
    return isOptionalSubscription && error && error.status === 404;
}

function getSubscriptionIds(subId, subSuffixes = []) {
    return [
        subId,
        ...subSuffixes.map((suffix) => `${subId}-${suffix}`),
    ];
}

function logUpstreamError(logger, baseUrl, subId, error) {
    if (typeof logger !== "function") {
        return;
    }

    logger(`Upstream ${baseUrl} failed for subscription id ${subId}`, error);
}

export async function fetchSubscription(baseUrl, subId, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = options.timeoutMs || DEFAULT_FETCH_TIMEOUT_MS;
    const retryAttempts = getRetryAttempts(options.retryAttempts);
    const attemptTimeoutMs = Math.max(1, Math.floor(timeoutMs / retryAttempts));
    const url = `${baseUrl.replace(/\/+$/, "")}/sub/${encodeURIComponent(subId)}`;

    let lastError;

    for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
        try {
            return await fetchSubscriptionAttempt(baseUrl, url, fetchImpl, attemptTimeoutMs);
        } catch (error) {
            lastError = error;

            if (options.quietNotFound && error && error.status === 404) {
                throw error;
            }

            if (attempt < retryAttempts - 1) {
                logUpstreamReconnect(options.logger, baseUrl, subId, attempt + 2, retryAttempts, error);
            }
        }
    }

    throw lastError;
}

function logUpstreamReconnect(logger, baseUrl, subId, nextAttempt, retryAttempts, error) {
    if (typeof logger !== "function") {
        return;
    }

    logger(
        `Reconnecting to upstream ${baseUrl} for subscription id ${subId}, attempt ${nextAttempt}/${retryAttempts}`,
        error,
    );
}

async function fetchSubscriptionAttempt(baseUrl, url, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(url, {
            method: "GET",
            headers: {
                "User-Agent": "sub-merge/1.0",
                Accept: "*/*",
            },
            signal: controller.signal,
        });

        if (response.status < 200 || response.status >= 300) {
            const error = new Error(`${baseUrl} returned HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return maybeDecodeSubscription(await response.text());
    } finally {
        clearTimeout(timeout);
    }
}

function getRetryAttempts(value) {
    return Number.isInteger(value) && value > 1 ? value : 1;
}

export function maybeDecodeSubscription(body) {
    const text = (body || "").trim();

    if (extractSubscriptionLinks(text).length > 0) {
        return text;
    }

    const compact = text.replace(/\s+/g, "");

    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
        return text;
    }

    let padded = compact;

    while (padded.length % 4 !== 0) {
        padded += "=";
    }

    for (const encoding of ["base64", "base64url"]) {
        try {
            const decoded = Buffer.from(padded, encoding).toString("utf8").trim();

            if (extractSubscriptionLinks(decoded).length > 0) {
                return decoded;
            }
        } catch (error) {
        }
    }

    return text;
}

export function extractSubscriptionLinks(text) {
    return text
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(line));
}
