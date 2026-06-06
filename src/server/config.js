export function getUpstreams(env = process.env) {
    return (env.UPSTREAMS || "")
        .split(",")
        .map(parseUpstream)
        .filter(Boolean);
}

export function getFetchTimeoutMs(env = process.env, defaultTimeoutMs) {
    const seconds = Number(env.TIMEOUT);

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return defaultTimeoutMs;
    }

    return Math.round(seconds * 1000);
}

export function getFetchRetryAttempts(env = process.env, defaultRetryAttempts = 1) {
    const attempts = Number(env.RETRIES);

    if (!Number.isInteger(attempts) || attempts <= 1) {
        return defaultRetryAttempts;
    }

    return attempts;
}

function parseUpstream(value) {
    const trimmed = value.trim();

    if (trimmed === "") {
        return null;
    }

    try {
        const url = new URL(trimmed);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        url.hash = "";
        url.search = "";

        return url.href.replace(/\/+$/, "");
    } catch (error) {
        return null;
    }
}
