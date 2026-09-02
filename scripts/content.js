(function() {
    "use strict";

    // ---------------------------------------------------------------------
    // Track the element under the cursor at the moment of a right-click, so
    // that when the "Generate Quote" context menu item is chosen we can work
    // out which plan/price the user actually clicked on.
    // ---------------------------------------------------------------------
    var lastContextMenuTarget = null;
    document.addEventListener("contextmenu", function(e) {
        lastContextMenuTarget = e.target;
    }, true);

    var CURRENCIES = [
        { code: "USD", symbol: "$", field: "Usd" },
        { code: "EUR", symbol: "€", field: "Eur" },
        { code: "GBP", symbol: "£", field: "Gbp" },
        { code: "INR", symbol: "₹", field: "Inr" },
        { code: "AUD", symbol: "A$", field: "Aud" }
    ];

    var PRODUCT_NAMES = {
        "/freshservice/pricing/": "Freshservice for IT teams",
        "/freshservice/msp/pricing/": "Freshservice for MSPs",
        "/freshservice/business-teams/pricing/": "Freshservice for Business Teams",
        "/freshservice/itam/pricing/": "Freshservice IT Asset Management",
        "/freshdesk/pricing/": "Freshdesk",
        "/freshdesk/omni/pricing/": "Freshdesk Omni",
        "/freshcaller-cloud-pbx/pricing/": "Freshcaller",
        "/live-chat-software/pricing/": "Freshchat",
        "/crm/pricing/": "Freshsales",
        "/crm/suite/pricing/": "Freshsales Suite",
        "/crm/marketing/pricing/": "Freshmarketer"
    };

    var EXTENSION_ICON_URL = "";
    try { EXTENSION_ICON_URL = chrome.runtime.getURL("images/icon-48.png"); } catch (e) { /* not running as an extension */ }

    var CADENCE_LABELS = { monthly: "Monthly", quarterly: "Quarterly", halfyearly: "Half-yearly" };
    var CADENCE_MULTIPLIERS = { monthly: 1, quarterly: 3, halfyearly: 6 };

    function currencyInfo(code) {
        for (var i = 0; i < CURRENCIES.length; i++) {
            if (CURRENCIES[i].code === code) return CURRENCIES[i];
        }
        return CURRENCIES[0];
    }

    function getProductName() {
        return PRODUCT_NAMES[window.location.pathname] || (document.title.split("|")[0] || "Product").trim();
    }

    // ---------------------------------------------------------------------
    // Same pricingDetails JSON shape the currency switcher relies on.
    // ---------------------------------------------------------------------
    function getPlans() {
        var el = document.getElementById("__NEXT_DATA__");
        if (!el) return null;
        try {
            var data = JSON.parse(el.innerHTML);
            var pageItem = data.props.pageProps.pageProps.componentsCollection.items.filter(function(it) {
                return it.pricingDetails;
            })[0];
            if (!pageItem) return null;
            return pageItem.pricingDetails.pricingPlansCollection.items;
        } catch (e) {
            return null;
        }
    }

    function getAnnualTermFromPage() {
        var termGroup = document.querySelector('[aria-label="Pricing term"]');
        var annualBtn = termGroup && [].slice.call(termGroup.querySelectorAll('[role="radio"]')).filter(function(b) {
            return b.innerText.trim() === "Annually";
        })[0];
        return annualBtn ? annualBtn.getAttribute("aria-checked") === "true" : true;
    }

    function toNumber(v) {
        if (v === undefined || v === null) return 0;
        var n = Number(String(v).replace(/,/g, ""));
        return isNaN(n) ? 0 : n;
    }

    // ---------------------------------------------------------------------
    // Addon rich-text price resolution (mirrors background.js's setCurrency).
    // ---------------------------------------------------------------------
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

    function firstEmbeddedLocalePrices(richText) {
        var found = null;
        function walk(node) {
            if (found || !node) return;
            if (node.nodeType === "embedded-entry-inline") {
                found = resolveLocalePrices(node, richText);
                return;
            }
            if (node.content) node.content.forEach(walk);
        }
        if (richText && richText.json) walk(richText.json);
        return found;
    }

    function addonPriceFor(localePrices, currencyCode, annual) {
        var info = currencyInfo(currencyCode);
        var entry = (localePrices || []).filter(function(p) { return p.fields && p.fields.currency === info.field; })[0];
        if (!entry) return 0;
        return annual ? entry.fields.annual : entry.fields.monthly;
    }

    // Priced addons available on a given plan (same detection the currency switcher uses: a
    // feature that's included in the plan and has an embedded price in its rich-text description).
    function planFeatureAddons(plan) {
        var results = [];
        plan.planFeaturesGroupCollection.items.forEach(function(g) {
            if (!g.productFeature || !g.includedInPlan || !g.description) return;
            if (!g.description.links || !g.description.links.entries || !g.description.links.entries.inline || !g.description.links.entries.inline.length) return;
            var lp = firstEmbeddedLocalePrices(g.description);
            if (lp) results.push({ name: g.productFeature.name, localePrices: lp });
        });
        return results;
    }

    // Some addons (e.g. "Freddy AI Copilot") aren't modeled as a plan feature at all - their price
    // is instead embedded inline in the plan's summary/highlights rich text, right after the addon's
    // name as plain text in the same paragraph. Walk every paragraph and pair each embedded price
    // with the name text that precedes it.
    function planSummaryAddons(plan) {
        var results = [];
        if (!plan.planSummary || !plan.planSummary.json) return results;
        function walk(node) {
            if (!node) return;
            if (node.nodeType === "paragraph" && node.content) {
                var name = null;
                var lp = null;
                for (var i = 0; i < node.content.length; i++) {
                    var child = node.content[i];
                    if (child.nodeType === "text" && !name && child.value && child.value.trim()) {
                        name = child.value.trim();
                    }
                    if (child.nodeType === "embedded-entry-inline") {
                        lp = resolveLocalePrices(child, plan.planSummary);
                    }
                }
                if (name && lp) results.push({ name: name, localePrices: lp });
            }
            if (node.content) node.content.forEach(walk);
        }
        walk(plan.planSummary.json);
        return results;
    }

    function planAddons(plan) {
        var seen = {};
        var results = [];
        planFeatureAddons(plan).concat(planSummaryAddons(plan)).forEach(function(a) {
            if (seen[a.name]) return;
            seen[a.name] = true;
            results.push(a);
        });
        return results;
    }

    // ---------------------------------------------------------------------
    // Work out which plan (by index) the user right-clicked on, from either
    // a main plan card price or the "Compare features" table's price header.
    // ---------------------------------------------------------------------
    function findEnclosingPlanIndex(target, plans) {
        if (!target || !plans) return -1;
        var cards = document.querySelectorAll(".pricing-plan-card-price__value");
        var ctaEls = document.querySelectorAll("[data-pricing-feature-cta]");
        var node = target;
        for (var i = 0; i < 16 && node; i++) {
            for (var j = 0; j < cards.length && j < plans.length; j++) {
                if (node === cards[j] || (node.contains && node.contains(cards[j]))) return j;
            }
            for (var k = 0; k < ctaEls.length; k++) {
                var priceDiv = ctaEls[k].previousElementSibling;
                if (priceDiv && (node === priceDiv || (node.contains && node.contains(priceDiv)))) {
                    var planName = ctaEls[k].getAttribute("data-pricing-plan-name");
                    for (var p = 0; p < plans.length; p++) {
                        if (plans[p].planName === planName) return p;
                    }
                }
            }
            node = node.parentElement;
        }
        return -1;
    }

    // ---------------------------------------------------------------------
    // App state: several independent quotes (e.g. "Direct" vs "Reseller", or
    // just alternative scenarios) so they can be compared side by side. One
    // quote can be flagged as the customer's current subscription, which is
    // then used as the baseline for an ARR delta on every other quote.
    // Currency is shared across all quotes so that delta is meaningful.
    // ---------------------------------------------------------------------
    var appState = {
        currency: "USD",
        quotes: [],
        activeIndex: 0
    };
    var nextItemId = 1;
    var nextQuoteId = 1;

    function newQuote(name) {
        var id = nextQuoteId++;
        return {
            id: id,
            name: name || ("Quote " + id), // based on a monotonic counter, not array length, so numbers never collide after a quote is removed
            isCurrent: false,
            customerType: "direct", // "direct" | "reseller"
            items: []
        };
    }

    function activeQuote() {
        if (!appState.quotes.length) appState.quotes.push(newQuote());
        if (appState.activeIndex >= appState.quotes.length) appState.activeIndex = appState.quotes.length - 1;
        return appState.quotes[appState.activeIndex];
    }

    function addPlanItem(planIndex, plans) {
        var plan = plans[planIndex];
        if (!plan) return null;
        var item = {
            id: nextItemId++,
            kind: "plan",
            planIndex: planIndex,
            planName: plan.planName,
            billedAnnually: getAnnualTermFromPage(),
            cadence: "monthly",
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        activeQuote().items.push(item);
        return item;
    }

    function addAddonItem(parentItemId, addon, billedAnnually) {
        var item = {
            id: nextItemId++,
            kind: "addon",
            parentItemId: parentItemId,
            name: addon.name,
            localePrices: addon.localePrices,
            billedAnnually: billedAnnually,
            cadence: "monthly",
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        activeQuote().items.push(item);
        return item;
    }

    function removeItem(id) {
        var quote = activeQuote();
        quote.items = quote.items.filter(function(it) {
            return it.id !== id && it.parentItemId !== id; // removing a plan also removes its addons
        });
    }

    function unitPricesFor(item, plans) {
        if (item.kind === "plan") {
            var plan = plans[item.planIndex];
            var info = currencyInfo(appState.currency);
            return {
                monthly: toNumber(plan["price" + info.field]),
                annual: toNumber(plan["price" + info.field + "Annual"])
            };
        }
        return {
            monthly: addonPriceFor(item.localePrices, appState.currency, false),
            annual: addonPriceFor(item.localePrices, appState.currency, true)
        };
    }

    // ARR (annual recurring revenue) for a line item is always the same regardless of how it's
    // actually invoiced: the plan's annual-commit rate if billed annually, otherwise its
    // month-to-month rate x 12. The invoicing cadence (monthly/quarterly/half-yearly), when not on
    // an annual commit, only changes what the displayed "per invoice" unit price looks like.
    function computeRow(item, plans) {
        var unit = unitPricesFor(item, plans);
        var qty = Math.max(0, toNumber(item.qty));
        var discount = Math.min(100, Math.max(0, toNumber(item.discountPct)));
        var arrRate = item.billedAnnually ? unit.annual : unit.monthly;
        var listAnnualTotal = arrRate * qty * 12;
        var annualTotal = listAnnualTotal * (1 - discount / 100);
        var margin = Math.min(100, Math.max(0, toNumber(item.marginPct)));
        var partnerCost = annualTotal * (1 - margin / 100);
        var cadenceMultiplier = item.billedAnnually ? 1 : (CADENCE_MULTIPLIERS[item.cadence] || 1);
        var cadenceUnitPrice = item.billedAnnually ? unit.annual : unit.monthly * cadenceMultiplier;
        return {
            unit: unit,
            cadenceUnitPrice: cadenceUnitPrice,
            listAnnualTotal: listAnnualTotal,
            annualTotal: annualTotal,
            partnerCost: partnerCost
        };
    }

    // ---------------------------------------------------------------------
    // Modal (built once, inside a shadow root so the host page's CSS can
    // never bleed in or out).
    // ---------------------------------------------------------------------
    var shadowRoot = null;
    var els = {};

    function fmt(n) {
        return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function money(n) {
        return currencyInfo(appState.currency).symbol + fmt(n);
    }

    function ensureModal() {
        if (shadowRoot) return;
        var host = document.createElement("div");
        host.id = "frsh-quote-host";
        document.documentElement.appendChild(host);
        shadowRoot = host.attachShadow({ mode: "open" });
        shadowRoot.innerHTML = MODAL_HTML;
        els.overlay = shadowRoot.getElementById("overlay");
        els.panel = shadowRoot.getElementById("panel");
        els.productName = shadowRoot.getElementById("productName");
        els.quoteTabs = shadowRoot.getElementById("quoteTabs");
        els.customerType = shadowRoot.getElementById("customerType");
        els.currencySelect = shadowRoot.getElementById("currencySelect");
        els.isCurrentCheckbox = shadowRoot.getElementById("isCurrentCheckbox");
        els.tbody = shadowRoot.getElementById("tbody");
        els.theadReseller = shadowRoot.getElementById("theadReseller");
        els.addPlanSelect = shadowRoot.getElementById("addPlanSelect");
        els.addPlanBtn = shadowRoot.getElementById("addPlanBtn");
        els.clearBtn = shadowRoot.getElementById("clearBtn");
        els.summarySection = shadowRoot.getElementById("summarySection");
        els.closeBtn = shadowRoot.getElementById("closeBtn");
        els.exportCsvBtn = shadowRoot.getElementById("exportCsvBtn");
        els.exportEmailBtn = shadowRoot.getElementById("exportEmailBtn");
        els.exportPanel = shadowRoot.getElementById("exportPanel");
        els.exportPanelTitle = shadowRoot.getElementById("exportPanelTitle");
        els.exportQuoteList = shadowRoot.getElementById("exportQuoteList");
        els.exportConfirmBtn = shadowRoot.getElementById("exportConfirmBtn");
        els.exportCancelBtn = shadowRoot.getElementById("exportCancelBtn");
        var iconEl = shadowRoot.getElementById("frshIcon");
        if (iconEl && EXTENSION_ICON_URL) iconEl.src = EXTENSION_ICON_URL;
        wireStaticEvents();
    }

    var MODAL_HTML = [
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;1,600&display=swap" rel="stylesheet">',
        '<style>',
        '  :host { all: initial; }',
        '  * { box-sizing: border-box; }',
        '  #overlay {',
        '    position: fixed; inset: 0; z-index: 2147483000;',
        '    background: rgba(16,17,20,0.55);',
        '    display: flex; align-items: flex-start; justify-content: center;',
        '    padding: 5vh 16px; overflow-y: auto;',
        '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
        '    font-size: 14px; color: #101114; line-height: 1.45;',
        '  }',
        '  #panel {',
        '    background: #f7f7f4; width: min(980px, 100%); border-radius: 22px; border: 1px solid #e9e8e0;',
        '    box-shadow: 0 24px 64px -12px rgba(0,0,0,0.4); padding: 28px 28px 24px;',
        '  }',
        '  .frsh-card { background: #ffffff; border: 1px solid #e3e2da; border-radius: 18px; padding: 20px; }',
        '  .frsh-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }',
        '  .frsh-icon { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }',
        '  .frsh-head h1 { font-family: "Lora", Georgia, serif; font-style: italic; font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }',
        '  .frsh-subheading { font-size: 13.5px; font-weight: 600; color: #63625a; margin-top: 1px; }',
        '  .frsh-head .sub { color: #a9a89e; font-size: 12px; margin-top: 2px; }',
        '  .cadence-select { margin-top: 4px; font-size: 11px; padding: 2px 6px; }',
        '  .frsh-close { margin-left: auto; border: none; background: #f0efe8; width: 32px; height: 32px; border-radius: 50%; font-size: 16px; cursor: pointer; color: #101114; }',
        '  .frsh-close:hover { background: #e3e2da; }',
        '  .frsh-controls { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }',
        '  .frsh-segmented { display: inline-flex; border: 1px solid #e3e2da; border-radius: 999px; padding: 3px; background: #f7f7f4; }',
        '  .frsh-segmented button { border: none; background: transparent; padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; color: #63625a; }',
        '  .frsh-segmented button.active { background: #101114; color: #fff; }',
        '  .frsh-field-label { font-size: 12px; font-weight: 600; color: #63625a; margin-right: 6px; }',
        '  select, input[type=number] { font-family: inherit; font-size: 13px; border: 1px solid #e3e2da; border-radius: 8px; padding: 6px 8px; color: #101114; background: #fff; }',
        '  input[type=number] { width: 68px; }',
        '  table { width: 100%; border-collapse: collapse; margin-top: 4px; }',
        '  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #63625a; font-weight: 700; padding: 0 8px 8px; border-bottom: 1px solid #e3e2da; white-space: nowrap; }',
        '  td { padding: 10px 8px; border-bottom: 1px solid #f0efe8; vertical-align: top; }',
        '  td.num, th.num { text-align: right; }',
        '  .item-name { font-weight: 600; }',
        '  .item-badge { display: inline-block; margin-top: 3px; font-size: 11px; font-weight: 600; color: #63625a; background: #f0efe8; border-radius: 999px; padding: 2px 8px; }',
        '  .addon-row .item-name { font-weight: 500; padding-left: 18px; position: relative; }',
        '  .addon-row .item-name::before { content: "\\2514"; position: absolute; left: 0; color: #a9a89e; }',
        '  .row-remove { border: none; background: none; color: #a9a89e; cursor: pointer; font-size: 15px; padding: 2px 6px; }',
        '  .row-remove:hover { color: #ff5a4e; }',
        '  .add-addon-row td { border-bottom: 1px solid #f0efe8; padding-top: 4px; padding-bottom: 12px; }',
        '  .add-addon-inline { display: flex; gap: 6px; align-items: center; padding-left: 18px; }',
        '  .add-addon-inline select { flex: 1; max-width: 260px; }',
        '  .add-addon-inline button, .frsh-add-plan button { border: 1px solid #101114; background: #fff; color: #101114; border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }',
        '  .add-addon-inline button:hover, .frsh-add-plan button:hover { background: #101114; color: #fff; }',
        '  .frsh-add-plan { display: flex; align-items: center; gap: 8px; margin-top: 14px; }',
        '  .frsh-add-plan select { min-width: 220px; }',
        '  .frsh-clear-btn { margin-left: auto; border: none; background: none; color: #63625a; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: underline; padding: 5px 4px; }',
        '  .frsh-clear-btn:hover { color: #ff5a4e; }',
        '  .frsh-empty { padding: 32px 8px; text-align: center; color: #63625a; }',
        '  .frsh-footer-note { margin-top: 16px; font-size: 11.5px; color: #63625a; }',
        '  .frsh-summary { margin-top: 18px; border-radius: 16px; background: #101114; color: #fff; padding: 18px 24px; display: flex; gap: 36px; flex-wrap: wrap; }',
        '  .frsh-summary-item .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #a9a89e; }',
        '  .frsh-summary-item .stat-value { font-size: 21px; font-weight: 700; margin-top: 3px; }',
        '  .frsh-summary-item .stat-sub { font-size: 13px; font-weight: 500; color: #a9a89e; }',
        '  .frsh-summary-item .stat-value.up { color: #ff8a7a; }',
        '  .frsh-summary-item .stat-value.down { color: #4ee08a; }',
        '  .frsh-quote-tabs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }',
        '  .quote-tab { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e3e2da; background: #f7f7f4; color: #63625a; border-radius: 999px; padding: 6px 8px 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab.active { background: #101114; color: #fff; border-color: #101114; }',
        '  .tab-current-badge { background: #00ac4b; color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 700; }',
        '  .tab-remove { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; opacity: 0.6; }',
        '  .tab-remove:hover { opacity: 1; background: rgba(255,90,78,0.2); }',
        '  .quote-tab-add { border: 1px dashed #a9a89e; background: transparent; color: #63625a; border-radius: 999px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab-add:hover { border-color: #101114; color: #101114; }',
        '  .frsh-current-toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #63625a; font-weight: 600; margin-left: auto; cursor: pointer; }',
        '  .frsh-actions { display: flex; gap: 10px; margin-top: 16px; }',
        '  .frsh-action-btn { border: 1px solid #101114; background: #fff; color: #101114; border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .frsh-action-btn:hover { background: #101114; color: #fff; }',
        '  .frsh-export-panel { margin-top: 12px; border: 1px solid #e3e2da; border-radius: 14px; padding: 16px; background: #fff; }',
        '  .frsh-export-title { font-size: 12.5px; font-weight: 700; margin-bottom: 10px; }',
        '  .frsh-export-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }',
        '  .frsh-export-list label { display: flex; align-items: center; gap: 8px; font-size: 13px; }',
        '  .frsh-export-buttons { display: flex; gap: 8px; }',
        '  .frsh-export-buttons button { border-radius: 999px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  #exportConfirmBtn { border: 1px solid #101114; background: #101114; color: #fff; }',
        '  #exportCancelBtn { border: 1px solid #e3e2da; background: #fff; color: #63625a; }',
        '</style>',
        '<div id="overlay">',
        '  <div id="panel" role="dialog" aria-label="Generate Quote">',
        '    <div class="frsh-head">',
        '      <img id="frshIcon" class="frsh-icon" alt="">',
        '      <div>',
        '        <h1>FRSH PriceView</h1>',
        '        <div class="frsh-subheading">Generate Quote</div>',
        '        <div class="sub" id="productName"></div>',
        '      </div>',
        '      <button class="frsh-close" id="closeBtn" aria-label="Close">✕</button>',
        '    </div>',
        '    <div class="frsh-quote-tabs" id="quoteTabs"></div>',
        '    <div class="frsh-controls">',
        '      <div class="frsh-segmented" id="customerType">',
        '        <button type="button" data-value="direct" class="active">Direct Customer</button>',
        '        <button type="button" data-value="reseller">Reseller Customer</button>',
        '      </div>',
        '      <div>',
        '        <span class="frsh-field-label">Currency</span>',
        '        <select id="currencySelect">',
        '          <option value="USD">USD</option>',
        '          <option value="EUR">EUR</option>',
        '          <option value="GBP">GBP</option>',
        '          <option value="INR">INR</option>',
        '          <option value="AUD">AUD</option>',
        '        </select>',
        '      </div>',
        '      <label class="frsh-current-toggle"><input type="checkbox" id="isCurrentCheckbox">Mark as current subscription</label>',
        '    </div>',
        '    <div class="frsh-card">',
        '    <table>',
        '      <thead>',
        '        <tr>',
        '          <th>Item</th>',
        '          <th class="num">Qty</th>',
        '          <th class="num">Unit Price</th>',
        '          <th class="num">Discount %</th>',
        '          <th class="num">Annual Cost</th>',
        '          <th class="num" id="theadReseller" hidden>Margin %</th>',
        '          <th class="num" id="theadResellerCost" hidden>Partner cost</th>',
        '          <th></th>',
        '        </tr>',
        '      </thead>',
        '      <tbody id="tbody"></tbody>',
        '    </table>',
        '    <div class="frsh-add-plan">',
        '      <select id="addPlanSelect"></select>',
        '      <button type="button" id="addPlanBtn">+ Add plan</button>',
        '      <button type="button" id="clearBtn" class="frsh-clear-btn">Clear quote</button>',
        '    </div>',
        '    </div>',
        '    <div class="frsh-summary" id="summarySection" hidden></div>',
        '    <div class="frsh-actions">',
        '      <button type="button" id="exportCsvBtn" class="frsh-action-btn">⬇ Download CSV</button>',
        '      <button type="button" id="exportEmailBtn" class="frsh-action-btn">✉ Email quote</button>',
        '    </div>',
        '    <div class="frsh-export-panel" id="exportPanel" hidden>',
        '      <div class="frsh-export-title" id="exportPanelTitle">Choose quotes to include</div>',
        '      <div id="exportQuoteList" class="frsh-export-list"></div>',
        '      <div class="frsh-export-buttons">',
        '        <button type="button" id="exportConfirmBtn">Continue</button>',
        '        <button type="button" id="exportCancelBtn">Cancel</button>',
        '      </div>',
        '    </div>',
        '    <div class="frsh-footer-note">Estimate only, generated from the pricing shown on this page. Not a binding quote.</div>',
        '  </div>',
        '</div>'
    ].join("\n");

    function wireStaticEvents() {
        els.overlay.addEventListener("mousedown", function(e) {
            if (e.target === els.overlay) closeModal();
        });
        els.closeBtn.addEventListener("click", closeModal);

        els.customerType.addEventListener("click", function(e) {
            var btn = e.target.closest("button[data-value]");
            if (!btn) return;
            activeQuote().customerType = btn.getAttribute("data-value");
            render();
        });

        els.currencySelect.addEventListener("change", function() {
            appState.currency = els.currencySelect.value;
            render();
        });

        els.isCurrentCheckbox.addEventListener("change", function() {
            var checked = els.isCurrentCheckbox.checked;
            appState.quotes.forEach(function(q) { q.isCurrent = false; });
            activeQuote().isCurrent = checked;
            render();
        });

        els.addPlanBtn.addEventListener("click", function() {
            var idx = Number(els.addPlanSelect.value);
            if (isNaN(idx)) return;
            var plans = getPlans();
            if (!plans) return;
            addPlanItem(idx, plans);
            render();
        });

        els.clearBtn.addEventListener("click", function() {
            if (!activeQuote().items.length) return;
            if (!window.confirm("Clear all line items in this quote and start a fresh quote?")) return;
            activeQuote().items = [];
            render();
        });

        els.exportCsvBtn.addEventListener("click", function() { openExportPanel("csv"); });
        els.exportEmailBtn.addEventListener("click", function() { openExportPanel("email"); });
        els.exportCancelBtn.addEventListener("click", closeExportPanel);
        els.exportConfirmBtn.addEventListener("click", function() {
            var plans = getPlans();
            var selected = getSelectedQuotesFromPanel();
            if (!plans || !selected.length) return;
            if (exportMode === "csv") downloadCsv(buildCsv(selected, plans), "frsh-quote.csv");
            else if (exportMode === "email") openEmailCompose(selected, plans);
            closeExportPanel();
        });

        // Quote tabs: switch active quote, remove one, or start a new one.
        els.quoteTabs.addEventListener("click", function(e) {
            var removeBtn = e.target.closest(".tab-remove");
            if (removeBtn) {
                var idx = Number(removeBtn.getAttribute("data-index"));
                if (appState.quotes.length <= 1) return;
                appState.quotes.splice(idx, 1);
                if (appState.activeIndex >= idx) appState.activeIndex = Math.max(0, appState.activeIndex - 1);
                render();
                return;
            }
            if (e.target.closest("#newQuoteBtn")) {
                appState.quotes.push(newQuote());
                appState.activeIndex = appState.quotes.length - 1;
                render();
                return;
            }
            var tab = e.target.closest(".quote-tab");
            if (tab) {
                appState.activeIndex = Number(tab.getAttribute("data-index"));
                render();
            }
        });

        // Double-click a tab to rename it (e.g. "Direct" vs "Reseller").
        els.quoteTabs.addEventListener("dblclick", function(e) {
            var tab = e.target.closest(".quote-tab");
            if (!tab) return;
            var quote = appState.quotes[Number(tab.getAttribute("data-index"))];
            if (!quote) return;
            var name = window.prompt("Rename quote", quote.name);
            if (name && name.trim()) {
                quote.name = name.trim();
                render();
            }
        });

        // Event delegation for the dynamically-rendered table body. Updates just this row's
        // computed cells (and the summary section) in place, so the input the user is typing in
        // never loses focus the way a full render() would cause.
        els.tbody.addEventListener("input", function(e) {
            var row = e.target.closest("tr[data-item-id]");
            if (!row) return;
            var id = Number(row.getAttribute("data-item-id"));
            var item = activeQuote().items.filter(function(it) { return it.id === id; })[0];
            if (!item) return;
            if (e.target.matches(".qty-input")) item.qty = e.target.value;
            else if (e.target.matches(".discount-input")) item.discountPct = e.target.value;
            else if (e.target.matches(".margin-input")) item.marginPct = e.target.value;
            else return;
            var plans = getPlans();
            if (!plans) return;
            var computed = computeRow(item, plans);
            var annualCell = row.querySelector(".cell-annual");
            var partnerCell = row.querySelector(".cell-partner");
            if (annualCell) annualCell.textContent = money(computed.annualTotal);
            if (partnerCell) partnerCell.textContent = money(computed.partnerCost);
            renderSummary();
        });

        // The invoicing cadence (Monthly/Quarterly/Half-yearly) only changes the displayed unit
        // price, never the ARR, so no other cell needs to change.
        els.tbody.addEventListener("change", function(e) {
            if (!e.target.matches(".cadence-select")) return;
            var row = e.target.closest("tr[data-item-id]");
            if (!row) return;
            var id = Number(row.getAttribute("data-item-id"));
            var item = activeQuote().items.filter(function(it) { return it.id === id; })[0];
            if (!item) return;
            item.cadence = e.target.value;
            var plans = getPlans();
            if (!plans) return;
            var computed = computeRow(item, plans);
            var unitCell = row.querySelector(".cell-unit");
            if (unitCell) unitCell.textContent = money(computed.cadenceUnitPrice);
        });

        els.tbody.addEventListener("click", function(e) {
            var removeRowBtn = e.target.closest(".row-remove");
            if (removeRowBtn) {
                var row = removeRowBtn.closest("tr[data-item-id]");
                removeItem(Number(row.getAttribute("data-item-id")));
                render();
                return;
            }
            var addAddonBtn = e.target.closest(".add-addon-btn");
            if (addAddonBtn) {
                var planItemId = Number(addAddonBtn.getAttribute("data-plan-item-id"));
                var select = shadowRoot.getElementById("addon-select-" + planItemId);
                if (!select || !select.value) return;
                var plans = getPlans();
                var planItem = activeQuote().items.filter(function(it) { return it.id === planItemId; })[0];
                if (!plans || !planItem) return;
                var addons = planAddons(plans[planItem.planIndex]);
                var addon = addons.filter(function(a) { return a.name === select.value; })[0];
                if (addon) addAddonItem(planItemId, addon, planItem.billedAnnually);
                render();
            }
        });
    }

    function closeModal() {
        if (els.overlay) els.overlay.style.display = "none";
    }

    // ---------------------------------------------------------------------
    // Export: download the chosen quote(s) as a CSV, or open a pre-filled
    // email with a plain-text summary. Both share the same quote picker.
    // ---------------------------------------------------------------------
    var exportMode = null;

    function openExportPanel(mode) {
        exportMode = mode;
        els.exportPanelTitle.textContent = mode === "csv" ? "Choose quotes to download" : "Choose quotes to email";
        els.exportConfirmBtn.textContent = mode === "csv" ? "Download CSV" : "Open email";
        var activeId = activeQuote().id;
        els.exportQuoteList.innerHTML = appState.quotes.map(function(q) {
            var checked = q.id === activeId ? " checked" : "";
            return '<label><input type="checkbox" class="export-quote-check" value="' + q.id + '"' + checked + ">" + escapeHtml(q.name) + (q.isCurrent ? " (current subscription)" : "") + "</label>";
        }).join("");
        els.exportPanel.hidden = false;
    }

    function closeExportPanel() {
        els.exportPanel.hidden = true;
        exportMode = null;
    }

    function getSelectedQuotesFromPanel() {
        var ids = [].map.call(els.exportQuoteList.querySelectorAll(".export-quote-check:checked"), function(cb) { return Number(cb.value); });
        return appState.quotes.filter(function(q) { return ids.indexOf(q.id) !== -1; });
    }

    function csvField(v) {
        var s = String(v == null ? "" : v);
        if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function itemLabel(item, plans) {
        if (item.kind === "plan") return getProductName() + " — " + plans[item.planIndex].planName;
        return item.name;
    }

    function buildCsv(selectedQuotes, plans) {
        var header = ["Quote", "Current Subscription", "Item", "Billing", "Qty", "Unit Price", "Discount %", "Annual Cost", "Margin %", "Partner Cost"];
        var rows = [header.map(csvField).join(",")];
        selectedQuotes.forEach(function(quote) {
            quote.items.forEach(function(item) {
                var row = computeRow(item, plans);
                var billing = item.billedAnnually ? "Annual" : CADENCE_LABELS[item.cadence] || "Monthly";
                var isReseller = quote.customerType === "reseller";
                rows.push([
                    quote.name,
                    quote.isCurrent ? "Yes" : "",
                    itemLabel(item, plans),
                    billing,
                    item.qty,
                    fmt(row.cadenceUnitPrice),
                    item.discountPct,
                    fmt(row.annualTotal),
                    isReseller ? item.marginPct : "",
                    isReseller ? fmt(row.partnerCost) : ""
                ].map(csvField).join(","));
            });
            var totals = totalsForQuote(quote, plans);
            rows.push([quote.name, "", "TOTAL", "", "", "", "", fmt(totals.totalArr), "", quote.customerType === "reseller" ? fmt(totals.totalPartner) : ""].map(csvField).join(","));
        });
        return rows.join("\n");
    }

    function downloadCsv(csvString, filename) {
        var blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function buildEmailBody(selectedQuotes, plans) {
        var lines = [getProductName() + " - Quote Summary", ""];
        selectedQuotes.forEach(function(quote) {
            lines.push(quote.name + (quote.isCurrent ? " (current subscription)" : "") + (quote.customerType === "reseller" ? " [Reseller]" : ""));
            quote.items.forEach(function(item) {
                var row = computeRow(item, plans);
                lines.push("  - " + itemLabel(item, plans) + " x" + item.qty + ": " + money(row.annualTotal) + "/yr");
            });
            var totals = totalsForQuote(quote, plans);
            lines.push("  Total ARR: " + money(totals.totalArr));
            if (quote.customerType === "reseller") lines.push("  Total partner cost: " + money(totals.totalPartner));
            lines.push("");
        });
        lines.push("Estimate only, generated from the pricing shown on the Freshworks pricing page. Not a binding quote.");
        return lines.join("\n");
    }

    function openEmailCompose(selectedQuotes, plans) {
        var subject = getProductName() + " - Quote";
        var body = buildEmailBody(selectedQuotes, plans);
        // Most mail clients truncate very long mailto: bodies; keep it well under the common ~2000
        // char limit and point to the CSV download for the full line-item breakdown.
        if (body.length > 1500) {
            body = body.slice(0, 1500) + "\n\n[Quote truncated for email - use \"Download CSV\" for the full breakdown.]";
        }
        var mailto = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        window.open(mailto, "_blank");
    }

    function openModal(planIndex) {
        ensureModal();
        var plans = getPlans();
        activeQuote(); // make sure at least one quote exists
        if (plans && planIndex != null && planIndex >= 0) {
            addPlanItem(planIndex, plans);
        }
        els.overlay.style.display = "flex";
        els.currencySelect.value = appState.currency;
        render();
    }

    // Totals for one quote, without touching the DOM - used both to render that quote's own
    // summary and to compute the "current subscription" baseline for every other quote's delta.
    function totalsForQuote(quote, plans) {
        var totalListArr = 0, totalArr = 0, totalPartner = 0;
        quote.items.forEach(function(it) {
            var row = computeRow(it, plans);
            totalListArr += row.listAnnualTotal;
            totalArr += row.annualTotal;
            totalPartner += row.partnerCost;
        });
        return { totalListArr: totalListArr, totalArr: totalArr, totalPartner: totalPartner };
    }

    function renderSummary() {
        if (!els.summarySection) return;
        var plans = getPlans();
        var quote = activeQuote();
        if (!plans || !quote.items.length) {
            els.summarySection.hidden = true;
            els.summarySection.innerHTML = "";
            return;
        }
        var totals = totalsForQuote(quote, plans);
        var totalDiscountAmount = totals.totalListArr - totals.totalArr;
        var totalDiscountPct = totals.totalListArr > 0 ? (totalDiscountAmount / totals.totalListArr * 100) : 0;
        var isReseller = quote.customerType === "reseller";
        var html = '<div class="frsh-summary-item"><div class="stat-label">Total ARR</div><div class="stat-value">' + money(totals.totalArr) + "</div></div>" +
            '<div class="frsh-summary-item"><div class="stat-label">Total discount applied</div><div class="stat-value">' + money(totalDiscountAmount) + ' <span class="stat-sub">(' + fmt(totalDiscountPct) + '%)</span></div></div>';
        if (isReseller) {
            html += '<div class="frsh-summary-item"><div class="stat-label">Total partner cost</div><div class="stat-value">' + money(totals.totalPartner) + "</div></div>";
        }
        var currentQuote = appState.quotes.filter(function(q) { return q.isCurrent; })[0];
        if (currentQuote && currentQuote.id !== quote.id) {
            var baseline = totalsForQuote(currentQuote, plans);
            var delta = totals.totalArr - baseline.totalArr;
            var deltaPct = baseline.totalArr > 0 ? (delta / baseline.totalArr * 100) : (delta === 0 ? 0 : 100);
            var sign = delta >= 0 ? "+" : "−";
            var cls = delta >= 0 ? "up" : "down";
            html += '<div class="frsh-summary-item"><div class="stat-label">ARR vs "' + escapeHtml(currentQuote.name) + '"</div><div class="stat-value ' + cls + '">' + sign + money(Math.abs(delta)) + ' <span class="stat-sub">(' + sign + fmt(Math.abs(deltaPct)) + "%)</span></div></div>";
        }
        els.summarySection.hidden = false;
        els.summarySection.innerHTML = html;
    }

    function renderTabs() {
        if (!els.quoteTabs) return;
        var html = appState.quotes.map(function(q, i) {
            var active = i === appState.activeIndex ? " active" : "";
            var badge = q.isCurrent ? '<span class="tab-current-badge">Current</span>' : "";
            var remove = appState.quotes.length > 1 ? '<span class="tab-remove" data-index="' + i + '" aria-label="Remove quote">✕</span>' : "";
            return '<button type="button" class="quote-tab' + active + '" data-index="' + i + '">' + escapeHtml(q.name) + badge + remove + "</button>";
        }).join("") + '<button type="button" id="newQuoteBtn" class="quote-tab-add">+ New quote</button>';
        els.quoteTabs.innerHTML = html;
    }

    function render() {
        if (!shadowRoot) return;
        var plans = getPlans();
        var quote = activeQuote();
        els.productName.textContent = getProductName();
        renderTabs();
        els.isCurrentCheckbox.checked = !!quote.isCurrent;

        [].forEach.call(els.customerType.querySelectorAll("button"), function(b) {
            b.classList.toggle("active", b.getAttribute("data-value") === quote.customerType);
        });
        var isReseller = quote.customerType === "reseller";
        var theadResellerCost = shadowRoot.getElementById("theadResellerCost");
        els.theadReseller.hidden = !isReseller;
        theadResellerCost.hidden = !isReseller;

        if (!plans) {
            els.tbody.innerHTML = '<tr><td colspan="8" class="frsh-empty">Could not read pricing data on this page.</td></tr>';
            renderSummary();
            return;
        }

        // "+ Add plan" dropdown lists every plan on the page. Plans shown as "Custom"/"Contact us"
        // (hidePrices) still carry a real list price in the underlying data, so they're addable too -
        // useful for internal quoting even where the public page hides the number.
        els.addPlanSelect.innerHTML = plans.map(function(p, idx) {
            return '<option value="' + idx + '">' + escapeHtml(p.planName) + "</option>";
        }).join("");

        if (!quote.items.length) {
            els.tbody.innerHTML = '<tr><td colspan="8" class="frsh-empty">No line items yet. Pick a plan below to start the quote.</td></tr>';
        } else {
            var rowsHtml = [];
            quote.items.filter(function(it) { return it.kind === "plan"; }).forEach(function(planItem) {
                rowsHtml.push(renderPlanRow(planItem, plans, isReseller));
                quote.items.filter(function(it) { return it.kind === "addon" && it.parentItemId === planItem.id; }).forEach(function(addonItem) {
                    rowsHtml.push(renderAddonRow(addonItem, plans, isReseller));
                });
                rowsHtml.push(renderAddAddonRow(planItem, plans, isReseller));
            });
            els.tbody.innerHTML = rowsHtml.join("");
        }

        renderSummary();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function resellerCells(row, isReseller, item) {
        if (!isReseller) return "";
        return '<td class="num"><input type="number" class="margin-input" min="0" max="100" step="1" value="' + item.marginPct + '"></td>' +
            '<td class="num cell-partner">' + money(row.partnerCost) + "</td>";
    }

    // Annual-commit items just show a plain "Billed annually" badge (there's only one cadence).
    // Non-annual items get a dropdown so the quote can reflect how they'll actually be invoiced.
    function cadenceControlHtml(item) {
        if (item.billedAnnually) {
            return '<span class="item-badge">Billed annually</span>';
        }
        var options = ["monthly", "quarterly", "halfyearly"].map(function(c) {
            var selected = (item.cadence || "monthly") === c ? " selected" : "";
            return '<option value="' + c + '"' + selected + ">" + CADENCE_LABELS[c] + "</option>";
        }).join("");
        return '<select class="cadence-select" aria-label="Billing cadence">' + options + "</select>";
    }

    function renderPlanRow(item, plans, isReseller) {
        var plan = plans[item.planIndex];
        var row = computeRow(item, plans);
        return '<tr data-item-id="' + item.id + '">' +
            '<td><div class="item-name">' + escapeHtml(getProductName()) + " — " + escapeHtml(plan.planName) + "</div>" +
            cadenceControlHtml(item) + "</td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '"></td>' +
            '<td class="num cell-unit">' + money(row.cadenceUnitPrice) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '"></td>' +
            '<td class="num cell-annual">' + money(row.annualTotal) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove">✕</button></td>' +
            "</tr>";
    }

    function renderAddonRow(item, plans, isReseller) {
        var row = computeRow(item, plans);
        return '<tr data-item-id="' + item.id + '" class="addon-row">' +
            '<td><div class="item-name">' + escapeHtml(item.name) + "</div>" +
            cadenceControlHtml(item) + "</td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '"></td>' +
            '<td class="num cell-unit">' + money(row.cadenceUnitPrice) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '"></td>' +
            '<td class="num cell-annual">' + money(row.annualTotal) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove">✕</button></td>' +
            "</tr>";
    }

    function renderAddAddonRow(planItem, plans, isReseller) {
        var plan = plans[planItem.planIndex];
        var alreadyAdded = activeQuote().items.filter(function(it) { return it.kind === "addon" && it.parentItemId === planItem.id; }).map(function(it) { return it.name; });
        var available = planAddons(plan).filter(function(a) { return alreadyAdded.indexOf(a.name) === -1; });
        var colCount = isReseller ? 8 : 6;
        if (!available.length) {
            return '<tr class="add-addon-row"><td colspan="' + colCount + '"></td></tr>';
        }
        var options = available.map(function(a) { return "<option>" + escapeHtml(a.name) + "</option>"; }).join("");
        return '<tr class="add-addon-row"><td colspan="' + colCount + '">' +
            '<div class="add-addon-inline">' +
            '<select id="addon-select-' + planItem.id + '">' + options + "</select>" +
            '<button type="button" class="add-addon-btn" data-plan-item-id="' + planItem.id + '">+ Add addon</button>' +
            "</div></td></tr>";
    }

    // ---------------------------------------------------------------------
    // Entry point: background.js sends this after the context menu is used,
    // either from a right-click on the page (try to detect the clicked
    // plan) or from right-clicking the toolbar icon (start empty).
    // ---------------------------------------------------------------------
    chrome.runtime.onMessage.addListener(function(message) {
        if (!message || message.type !== "FRSH_OPEN_QUOTE") return;
        var planIndex = -1;
        if (message.source === "page" && lastContextMenuTarget) {
            var plans = getPlans();
            if (plans) planIndex = findEnclosingPlanIndex(lastContextMenuTarget, plans);
        }
        openModal(planIndex);
    });
})();
