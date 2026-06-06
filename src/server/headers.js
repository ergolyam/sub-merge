export function getRequestHeader(request, name) {
    const value = request.headers[name.toLowerCase()];

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    return value === undefined ? "" : String(value);
}

export function isBrowserRequest(request) {
    const accept = getRequestHeader(request, "Accept").toLowerCase();
    const userAgent = getRequestHeader(request, "User-Agent").toLowerCase();

    return accept.includes("text/html") &&
        /\b(mozilla|chrome|chromium|safari|firefox|edg|opr)\b/.test(userAgent);
}
