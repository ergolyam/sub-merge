export const DEFAULT_FETCH_TIMEOUT_MS = 5000;

export async function mergeSubscriptions(subId, upstreams, options = {}) {
    const results = await Promise.all(upstreams.map(async (baseUrl) => {
        try {
            return {
                ok: true,
                text: await fetchSubscription(baseUrl, subId, options),
            };
        } catch (error) {
            logUpstreamError(options.logger, baseUrl, subId, error);
            return {
                ok: false,
                text: "",
            };
        }
    }));

    const links = [];
    const seen = new Set();
    const successfulUpstreams = results.filter((result) => result.ok).length;

    for (const result of results) {
        for (const link of extractSubscriptionLinks(result.text)) {
            if (!seen.has(link)) {
                seen.add(link);
                links.push(link);
            }
        }
    }

    return {
        links,
        upstreamStatus: `${successfulUpstreams}/${upstreams.length}`,
    };
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
    const url = `${baseUrl.replace(/\/+$/, "")}/sub/${encodeURIComponent(subId)}`;
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
            throw new Error(`${baseUrl} returned HTTP ${response.status}`);
        }

        return maybeDecodeSubscription(await response.text());
    } finally {
        clearTimeout(timeout);
    }
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
