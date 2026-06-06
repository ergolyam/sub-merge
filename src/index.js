import fs from "fs";

const SUBSCRIPTION_TEMPLATE = fs.readFileSync("/etc/nginx/submerge/template.html", "utf8");
const SUBSCRIPTION_STYLE = fs.readFileSync("/etc/nginx/submerge/styles.css", "utf8");
const SUBSCRIPTION_SCRIPT = fs.readFileSync("/etc/nginx/submerge/client.js", "utf8");

function getUpstreams() {
    return (process.env.SUBMERGE_UPSTREAMS || "")
        .split(",")
        .map(function (s) {
            return s.trim();
        })
        .filter(function (s) {
            return /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(s);
        });
}

const SUB_PREFIX = "/sub-merge/";

function getSubId(r) {
    if (!r.uri.startsWith(SUB_PREFIX)) {
        return null;
    }

    const subId = r.uri.slice(SUB_PREFIX.length);
    return /^[A-Za-z0-9_-]{1,256}$/.test(subId) ? subId : null;
}

function maybeDecodeSubscription(body) {
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

    const encodings = ["base64", "base64url"];

    for (let i = 0; i < encodings.length; i++) {
        try {
            const decoded = Buffer.from(padded, encodings[i]).toString("utf8").trim();
            if (extractSubscriptionLinks(decoded).length > 0) {
                return decoded;
            }
        } catch (e) {
        }
    }

    return text;
}

function extractSubscriptionLinks(text) {
    return text
        .replace(/\r/g, "\n")
        .split("\n")
        .map(function (line) {
            return line.trim();
        })
        .filter(function (line) {
            return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(line);
        });
}

function getRequestHeader(r, name) {
    const headers = r.headersIn || {};
    const lowerName = name.toLowerCase();
    const keys = Object.keys(headers);

    for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === lowerName) {
            return String(headers[keys[i]]);
        }
    }

    return "";
}

function isBrowserRequest(r) {
    const accept = getRequestHeader(r, "Accept").toLowerCase();
    const userAgent = getRequestHeader(r, "User-Agent").toLowerCase();

    return accept.indexOf("text/html") !== -1 &&
        /\b(mozilla|chrome|chromium|safari|firefox|edg|opr)\b/.test(userAgent);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(text) {
    return escapeHtml(text).replace(/"/g, "&quot;");
}

function getLinkName(link) {
    const hash = link.indexOf("#");

    if (hash === -1 || hash === link.length - 1) {
        return "";
    }

    const name = link.slice(hash + 1);

    try {
        return decodeURIComponent(name);
    } catch (e) {
        return name;
    }
}

function renderLinkRow(link) {
    const name = getLinkName(link);
    const nameHtml = name === "" ? "" : '<div class="link-name">' + escapeHtml(name) + "</div>";

    const linkAttribute = escapeHtmlAttribute(link);

    return '<div class="link-row">' +
        '<button class="copy-link" type="button" data-link="' + linkAttribute + '">Copy</button>' +
        '<div class="link-text">' + nameHtml + '<code title="' + linkAttribute + '">' + escapeHtml(link) + "</code></div>" +
        "</div>";
}

function renderBrowserSubscription(plain, upstreamStatus) {
    const links = extractSubscriptionLinks(plain);

    return SUBSCRIPTION_TEMPLATE
        .replace("{{SUBSCRIPTION_STYLE}}", SUBSCRIPTION_STYLE)
        .replace("{{SUBSCRIPTION_SCRIPT}}", SUBSCRIPTION_SCRIPT)
        .replace("{{LINK_COUNT}}", String(links.length))
        .replace("{{UPSTREAM_STATUS}}", upstreamStatus)
        .replace("{{LINK_ROWS}}", links.map(renderLinkRow).join("\n"));
}

function returnNotFound(r) {
    r.return(404);
}

async function fetchSubscription(baseUrl, subId) {
    const url = baseUrl.replace(/\/+$/, "") + "/sub/" + encodeURIComponent(subId);

    const resp = await ngx.fetch(url, {
        method: "GET",
        headers: {
            "User-Agent": "sub-merge/1.0",
            "Accept": "*/*",
        },
    });

    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(baseUrl + " returned HTTP " + resp.status);
    }

    const body = await resp.text();
    return maybeDecodeSubscription(body);
}

async function merge(r) {
    const subId = getSubId(r);

    if (subId === null) {
        returnNotFound(r);
        return;
    }

    const upstreams = getUpstreams();

    if (upstreams.length === 0) {
        r.return(500, "SUBMERGE_UPSTREAMS is empty\n");
        return;
    }

    const results = await Promise.all(upstreams.map(async function (baseUrl) {
        try {
            return {
                ok: true,
                text: await fetchSubscription(baseUrl, subId),
            };
        } catch (e) {
            return {
                ok: false,
                text: "",
            };
        }
    }));

    const successfulUpstreams = results.filter(function (result) {
        return result.ok;
    }).length;
    const upstreamStatus = successfulUpstreams + "/" + upstreams.length;

    const links = [];
    const seen = Object.create(null);

    for (let i = 0; i < results.length; i++) {
        const extracted = extractSubscriptionLinks(results[i].text);
        for (let j = 0; j < extracted.length; j++) {
            const link = extracted[j];
            if (!seen[link]) {
                seen[link] = true;
                links.push(link);
            }
        }
    }

    if (links.length === 0) {
        returnNotFound(r);
        return;
    }

    const plain = links.join("\n") + "\n";

    r.headersOut["Cache-Control"] = "no-store";

    if (isBrowserRequest(r)) {
        r.headersOut["Content-Type"] = "text/html; charset=utf-8";
        r.return(200, renderBrowserSubscription(plain, upstreamStatus));
        return;
    }

    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";

    const encoded = Buffer.from(plain, "utf8").toString("base64");
    r.return(200, encoded);
}

export default { merge };
