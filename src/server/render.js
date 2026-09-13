import { readFileSync } from "node:fs";

import { extractSubscriptionLinks } from "./subscription.js";

const SUBSCRIPTION_TEMPLATE = readFileSync(new URL("../client/subscription.html", import.meta.url), "utf8");

export function renderBrowserSubscription(plain, upstreamStatus) {
    const links = extractSubscriptionLinks(plain);

    return SUBSCRIPTION_TEMPLATE
        .replace("{{LINK_COUNT}}", String(links.length))
        .replace("{{UPSTREAM_STATUS}}", upstreamStatus)
        .replace("{{LINK_ROWS}}", () => links.map(renderLinkRow).join("\n"));
}

function renderLinkRow(link) {
    const config = getAmneziaWGConfig(link);
    const name = getLinkName(link, config);
    const nameHtml = name === "" ? "" : `<div class="link-name">${escapeHtml(name)}</div>`;
    const linkAttribute = escapeHtmlAttribute(link);
    const copyAttribute = escapeHtmlAttribute(config || link);
    const copyLabel = config ? "Copy configuration" : "Copy link";

    return '<div class="link-row">' +
        `<button class="copy-link" type="button" data-link="${copyAttribute}" data-label="${copyLabel}" aria-label="${copyLabel}" title="${copyLabel}"></button>` +
        `<div class="link-text">${nameHtml}<code title="${linkAttribute}">${escapeHtml(link)}</code></div>` +
        "</div>";
}

function getAmneziaWGConfig(link) {
    const match = /^vpn:\/\/([A-Za-z0-9_-]+={0,2})(?:#.*)?$/i.exec(link);

    if (!match || match[1].replace(/=+$/, "").length % 4 === 1) {
        return "";
    }

    const config = Buffer.from(match[1], "base64url").toString("utf8");

    return /^\[Interface\]\r?$/m.test(config) && /^\[Peer\]\r?$/m.test(config) ? config : "";
}

function getLinkName(link, config) {
    const hash = link.indexOf("#");

    if (hash === -1 || hash === link.length - 1) {
        const remark = /^#[ \t]*(.*)$/m.exec(config);
        return remark?.[1].trim() || (config ? "AmneziaWG" : "");
    }

    const name = link.slice(hash + 1);

    try {
        return decodeURIComponent(name);
    } catch (error) {
        return name;
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(text) {
    return escapeHtml(text).replace(/"/g, "&quot;").replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
}
