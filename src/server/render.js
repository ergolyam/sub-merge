import { readFileSync } from "node:fs";

import { extractSubscriptionLinks } from "./subscription.js";

const SUBSCRIPTION_TEMPLATE = readFileSync(new URL("../client/subscription.html", import.meta.url), "utf8");

export function renderBrowserSubscription(plain, upstreamStatus) {
    const links = extractSubscriptionLinks(plain);

    return SUBSCRIPTION_TEMPLATE
        .replace("{{LINK_COUNT}}", String(links.length))
        .replace("{{UPSTREAM_STATUS}}", upstreamStatus)
        .replace("{{LINK_ROWS}}", links.map(renderLinkRow).join("\n"));
}

function renderLinkRow(link) {
    const name = getLinkName(link);
    const nameHtml = name === "" ? "" : `<div class="link-name">${escapeHtml(name)}</div>`;
    const linkAttribute = escapeHtmlAttribute(link);

    return '<div class="link-row">' +
        `<button class="copy-link" type="button" data-link="${linkAttribute}" aria-label="Copy link" title="Copy link"></button>` +
        `<div class="link-text">${nameHtml}<code title="${linkAttribute}">${escapeHtml(link)}</code></div>` +
        "</div>";
}

function getLinkName(link) {
    const hash = link.indexOf("#");

    if (hash === -1 || hash === link.length - 1) {
        return "";
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
    return escapeHtml(text).replace(/"/g, "&quot;");
}
