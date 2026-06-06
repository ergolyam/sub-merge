export function getUpstreams(env = process.env) {
    return (env.UPSTREAMS || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(item));
}
