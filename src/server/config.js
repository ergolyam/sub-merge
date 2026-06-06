export function getUpstreams(env = process.env) {
    return (env.UPSTREAMS || "")
        .split(",")
        .map(parseUpstream)
        .filter(Boolean);
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
