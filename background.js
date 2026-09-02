chrome.runtime.onUpdateAvailable.addListener(function(details) {
    chrome.runtime.reload(); // To restart the chrome App instantaneously
});
chrome.runtime.onInstalled.addListener((details) => {
    chrome.action.setBadgeText({
        text: "FRSH",
    });
    setupContextMenus();
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({
            url: "./installed.html"
        });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        chrome.tabs.create({
            url: "./installed.html"
        });
    }
});
chrome.runtime.onStartup.addListener(setupContextMenus);

// Freshservice for CX (Customer Experience) pricing support is coming soon.
const targetUrls = [
    "https://www.freshworks.com/freshservice/pricing/",
    "https://www.freshworks.com/freshservice/msp/pricing/",
    "https://www.freshworks.com/freshservice/business-teams/pricing/",
    "https://www.freshworks.com/freshservice/itam/pricing/",
    "https://www.freshworks.com/freshdesk/pricing/",
    "https://www.freshworks.com/freshdesk/omni/pricing/",
    "https://www.freshworks.com/freshcaller-cloud-pbx/pricing/",
    "https://www.freshworks.com/live-chat-software/pricing/",
    "https://www.freshworks.com/crm/pricing/",
    "https://www.freshworks.com/crm/suite/pricing/",
    "https://www.freshworks.com/crm/marketing/pricing/"
];
function isSupportedUrl(url) {
    return targetUrls.some(function(u) { return url.startsWith(u); });
}
const documentUrlPatterns = targetUrls.map(function(u) { return u + "*"; });

// "Generate Quote" is offered two ways: right-clicking anywhere on a supported pricing page (the
// content script figures out which plan/price was under the cursor), and right-clicking the
// extension's own toolbar icon (no price context, so the quote modal opens empty and the user picks
// a plan). Chrome automatically shows the extension's own icon next to both menu items.
function setupContextMenus() {
    chrome.contextMenus.removeAll(function() {
        chrome.contextMenus.create({
            id: "frsh-generate-quote-page",
            title: "Generate Quote",
            contexts: ["page"],
            documentUrlPatterns: documentUrlPatterns
        });
        chrome.contextMenus.create({
            id: "frsh-generate-quote-action",
            title: "Generate Quote",
            contexts: ["action"]
        });
        chrome.contextMenus.create({
            id: "frsh-help-action",
            title: "Help",
            contexts: ["action"]
        });
        chrome.contextMenus.create({
            id: "frsh-about-action",
            title: "About FRSH PriceView",
            contexts: ["action"]
        });
    });
}

function sendOpenQuoteMessage(tabId, source) {
    chrome.tabs.sendMessage(tabId, { type: "FRSH_OPEN_QUOTE", source: source }, function() {
        void chrome.runtime.lastError; // no content script on this tab (unsupported page) - ignore
    });
}

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (!tab || !tab.id) return;
    if (info.menuItemId === "frsh-generate-quote-page") {
        sendOpenQuoteMessage(tab.id, "page");
    } else if (info.menuItemId === "frsh-generate-quote-action") {
        if (!isSupportedUrl(tab.url)) return;
        sendOpenQuoteMessage(tab.id, "action");
    } else if (info.menuItemId === "frsh-help-action") {
        chrome.tabs.create({ url: "installed.html#how-it-works" });
    } else if (info.menuItemId === "frsh-about-action") {
        chrome.tabs.create({ url: "installed.html" });
    }
});
const currency = [{
        "code": "US",
        "label": "USD"
    },
    {
        "code": "EU",
        "label": "EUR"
    },
    {
        "code": "GB",
        "label": "GBP"
    },
    {
        "code": "IN",
        "label": "INR"
    },
    {
        "code": "AU",
        "label": "AUD"
    }
];
var priceCount = 0;

function initialiseDropDown() {
    //donothing
}

// Freshservice for IT teams is the "home" pricing page - clicking the toolbar icon anywhere that
// isn't one of the pages we actually track sends the user there instead of doing nothing.
const DEFAULT_PRICING_URL = "https://www.freshworks.com/freshservice/pricing/";

chrome.action.onClicked.addListener(async (tab) => {
    if (isSupportedUrl(tab.url)) {
        const nextState = currency[priceCount++].label;
        // Set the action badge to the next state
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: nextState,
        });
        chrome.scripting
            .executeScript({
                target: { tabId: tab.id },
                func: setCurrency,
                args: [currency[priceCount - 1].code, nextState],
            })
            .then(() => console.log("injected the currency function"));
        if (priceCount == 5) priceCount = 0;
    } else {
        chrome.tabs.update(tab.id, { url: DEFAULT_PRICING_URL });
    }
});

// The Freshworks pricing pages listed in targetUrls above (Freshservice, Freshdesk, Freshcaller,
// Freshchat/live-chat, CRM) were rebuilt by Freshworks around mid-2026 with a new Contentful-backed
// JSON shape (pricingDetails.pricingPlansCollection instead of a flat top-level items collection) and
// new HTML structure (stable BEM-ish classnames like .pricing-plan-card-price__value and data-pricing-*
// attributes instead of the old styled-components hash classnames). All of these pages share this same
// structure, so this single function handles them all. Freshservice for CX pricing support is coming soon.
function setCurrency(currCode, nextState) {
    var addData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
    var pageItem = addData.props.pageProps.pageProps.componentsCollection.items.filter(function(it) {
        return it.pricingDetails;
    })[0];
    if (!pageItem) {
        console.log("FRSH PriceView: unrecognised pricing page structure, skipping.");
        return;
    }

    var currencyMap = {
        "USD": { symbol: "$", suffix: "Usd", field: "Usd" },
        "EUR": { symbol: "€", suffix: "Eur", field: "Eur" },
        "GBP": { symbol: "£", suffix: "Gbp", field: "Gbp" },
        "INR": { symbol: "₹", suffix: "Inr", field: "Inr" },
        "AUD": { symbol: "A$", suffix: "Aud", field: "Aud" }
    };
    var curr = currencyMap[nextState] || currencyMap["USD"];
    var plans = pageItem.pricingDetails.pricingPlansCollection.items;

    var termGroup = document.querySelector('[aria-label="Pricing term"]');
    var annualBtn = termGroup && [].slice.call(termGroup.querySelectorAll('[role="radio"]')).filter(function(b) {
        return b.innerText.trim() === "Annually";
    })[0];
    var annualTerm = annualBtn ? annualBtn.getAttribute("aria-checked") === "true" : true;

    // Addon prices (E-signature, Freddy AI Copilot, Orchestration Transaction Packs, etc.) are stored
    // as Contentful rich text with an embedded price entry inlined mid-sentence. The embedded entry is
    // resolved either directly on the node (planSummary) or via the rich text's own links.entries.inline
    // array keyed by sys.id (planFeaturesGroupCollection[].description).
    function resolveLocalePrices(node, richText) {
        if (node.data && node.data.target && node.data.target.fields && node.data.target.fields.localePrices) {
            return node.data.target.fields.localePrices;
        }
        var targetId = node.data && node.data.target && node.data.target.sys && node.data.target.sys.id;
        if (targetId && richText.links && richText.links.entries && richText.links.entries.inline) {
            var match = richText.links.entries.inline.filter(function(e) { return e.sys && e.sys.id === targetId; })[0];
            if (match) return match.localePrices;
        }
        return null;
    }

    function priceForCurrency(localePrices, annual) {
        if (!localePrices) return null;
        var entry = localePrices.filter(function(p) { return p.fields && p.fields.currency === curr.field; })[0];
        if (!entry) return null;
        return annual ? entry.fields.annual : entry.fields.monthly;
    }

    function renderRichText(richText, annual) {
        if (!richText || !richText.json) return "";
        var out = "";
        function walk(node) {
            if (!node) return;
            if (node.nodeType === "text") { out += node.value; return; }
            if (node.nodeType === "embedded-entry-inline") {
                var price = priceForCurrency(resolveLocalePrices(node, richText), annual);
                if (price !== null && price !== undefined) {
                    out += curr.symbol + Number(price).toLocaleString("en-US");
                }
                return;
            }
            if (node.content) node.content.forEach(walk);
        }
        walk(richText.json);
        return out;
    }

    function extractEmbeddedLocalePrices(richText) {
        var results = [];
        if (!richText || !richText.json) return results;
        function walk(node) {
            if (!node) return;
            if (node.nodeType === "embedded-entry-inline") {
                var lp = resolveLocalePrices(node, richText);
                if (lp) results.push(lp);
                return;
            }
            if (node.content) node.content.forEach(walk);
        }
        walk(richText.json);
        return results;
    }

    // 1. Main plan card prices (Starter / Growth / Pro / Enterprise "Custom")
    var priceEls = document.querySelectorAll(".pricing-plan-card-price__value");
    for (var i = 0; i < priceEls.length && i < plans.length; i++) {
        var plan = plans[i];
        if (plan.hidePrices) continue;
        var mainKey = "price" + curr.suffix + (annualTerm ? "Annual" : "");
        if (plan[mainKey] !== undefined && plan[mainKey] !== null) {
            priceEls[i].innerText = curr.symbol + plan[mainKey];
        }
    }

    // 2. "Compare features" table plan price headers
    var ctaEls = document.querySelectorAll("[data-pricing-feature-cta]");
    ctaEls.forEach(function(a) {
        var planName = a.getAttribute("data-pricing-plan-name");
        var plan = plans.filter(function(p) { return p.planName === planName; })[0];
        if (!plan || plan.hidePrices) return;
        var priceDiv = a.previousElementSibling;
        if (!priceDiv) return;
        var headerKey = "price" + curr.suffix + (annualTerm ? "Annual" : "");
        var unit = annualTerm ? plan.planUnitAnnual : plan.planUnit;
        if (plan[headerKey] !== undefined) {
            priceDiv.innerText = curr.symbol + plan[headerKey] + " " + (unit || "");
        }
    });

    // 3. Inline add-on prices shown directly on plan cards (e.g. "Freddy AI Copilot €29/agent/month")
    var inlineGreySpans = document.querySelectorAll(".rt-inline-grey");
    var inlinePricesQueue = [];
    plans.forEach(function(plan) {
        if (plan.planSummary) {
            extractEmbeddedLocalePrices(plan.planSummary).forEach(function(lp) {
                inlinePricesQueue.push(lp);
            });
        }
    });
    for (var j = 0; j < inlineGreySpans.length && j < inlinePricesQueue.length; j++) {
        var inlinePrice = priceForCurrency(inlinePricesQueue[j], annualTerm);
        if (inlinePrice === null || inlinePrice === undefined) continue;
        var span = inlineGreySpans[j];
        var textNode = null;
        for (var n = 0; n < span.childNodes.length; n++) {
            if (span.childNodes[n].nodeType === 3) { textNode = span.childNodes[n]; break; }
        }
        if (textNode) {
            textNode.nodeValue = curr.symbol + Number(inlinePrice).toLocaleString("en-US");
        }
    }

    // 4. Addon rows inside the (initially collapsed) "View all features" comparison table, e.g.
    // E-signature, Business Agent License, Orchestration Transaction Packs, Connector App Tasks,
    // @mentions. The set of priced features is derived from the JSON itself rather than a hardcoded
    // list, so it keeps working if Freshworks adds or removes a priced addon.
    if (ctaEls.length) {
        var comparisonRoot = ctaEls[0].parentElement.parentElement;
        var pricedFeatureNames = {};
        plans.forEach(function(plan) {
            plan.planFeaturesGroupCollection.items.forEach(function(g) {
                if (g.productFeature && g.description && g.description.links && g.description.links.entries.inline.length > 0) {
                    pricedFeatureNames[g.productFeature.name] = true;
                }
            });
        });
        Object.keys(pricedFeatureNames).forEach(function(featureName) {
            var divs = comparisonRoot.querySelectorAll("div");
            var nameDiv = null;
            for (var d = 0; d < divs.length; d++) {
                var firstChild = divs[d].children[0];
                if (firstChild && (firstChild.tagName === "SPAN" || firstChild.tagName === "A") && firstChild.textContent.trim() === featureName) {
                    nameDiv = divs[d];
                    break;
                }
            }
            if (!nameDiv) return;
            var cells = [];
            var sib = nameDiv.nextElementSibling;
            while (sib && cells.length < plans.length && sib.tagName === "DIV") {
                cells.push(sib);
                sib = sib.nextElementSibling;
            }
            for (var p = 0; p < plans.length && p < cells.length; p++) {
                if (cells[p].innerText.trim() === "") continue; // not included in this plan
                var group = plans[p].planFeaturesGroupCollection.items.filter(function(g) {
                    return g.productFeature && g.productFeature.name === featureName;
                })[0];
                if (!group || !group.includedInPlan || !group.description) continue;
                var rendered = renderRichText(group.description, annualTerm);
                if (rendered) {
                    cells[p].innerText = rendered;
                }
            }
        });
    }
}

chrome.tabs.onUpdated.addListener(
    function(tab_id, changeInfo, tab) {
        if (isSupportedUrl(tab.url)) {
            priceCount = 0;
            chrome.scripting
                .executeScript({
                    target: { tabId: tab_id },
                    func: initialiseDropDown,
                    args: [currency[priceCount].code],
                })
                .then(() => console.log("injected the initialisation function"));
        }
    }
);
