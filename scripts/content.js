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

    // Billing cycle is always user-editable after a line item is added (not fixed by however the
    // page was toggled at right-click time), so "annual" lives in this same set rather than being a
    // separate billedAnnually boolean.
    var BILLING_CYCLE_LABELS = { annual: "Annual", monthly: "Monthly", quarterly: "Quarterly", halfyearly: "Half-yearly" };
    var BILLING_CYCLE_MONTHS = { annual: 12, monthly: 1, quarterly: 3, halfyearly: 6 };

    // Fixed reference rates (1 unit of that currency = this many USD), used only to show an
    // approximate USD figure alongside a non-USD ARR - not live/market rates.
    var USD_CONVERSION_RATES = { EUR: 1.1739, GBP: 1.3438, AUD: 0.6679, INR: 0.0111 };

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
    // just alternative scenarios) so they can be compared side by side.
    // "Compare Prices" picks exactly two of them (compare.quoteIds) and one of
    // those two can be flagged as the customer's current subscription
    // (isCurrent), used as the baseline for an ARR delta on the other one.
    // Currency is shared across all quotes so that delta is meaningful.
    // ---------------------------------------------------------------------
    var appState = {
        currency: "USD",
        quotes: [],
        activeIndex: 0,
        compare: { enabled: false, quoteIds: [] }, // quoteIds: up to 2 quote ids being compared
        proration: { enabled: false, billingCycle: "annual", changeDate: "", endDate: "" }
    };
    var nextItemId = 1;
    var nextQuoteId = 1;

    function newQuote() {
        return {
            id: nextQuoteId++, // stable internal identity, never reused
            customName: null, // set only once the user renames the tab; otherwise the display name is derived live from position
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

    // Default quote names are always "Quote <position>" based on where the quote currently sits in
    // the list, so deleting a quote in the middle renumbers the rest instead of leaving a gap or a
    // never-reused counter. A user-supplied rename (customName) always wins and is never renumbered.
    function quoteDisplayName(quote) {
        if (quote.customName) return quote.customName;
        var idx = appState.quotes.indexOf(quote);
        return "Quote " + (idx + 1);
    }

    function addPlanItem(planIndex, plans) {
        var plan = plans[planIndex];
        if (!plan) return null;
        var item = {
            id: nextItemId++,
            kind: "plan",
            planIndex: planIndex,
            planName: plan.planName,
            billingCycle: getAnnualTermFromPage() ? "annual" : "monthly",
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        activeQuote().items.push(item);
        return item;
    }

    function addAddonItem(parentItemId, addon, billingCycle) {
        var item = {
            id: nextItemId++,
            kind: "addon",
            parentItemId: parentItemId,
            name: addon.name,
            localePrices: addon.localePrices,
            billingCycle: billingCycle || "monthly",
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
    // month-to-month rate x 12. This stays comparable across items even when their billing cycles
    // differ, so it's what the summary panel and CSV/Excel totals sum. Invoice Value is the
    // discounted amount actually charged per billing cycle (what shows in the table row) - it is
    // cycle-specific and not meaningful to sum across items on different cycles.
    function computeRow(item, plans) {
        var unit = unitPricesFor(item, plans);
        var qty = Math.max(0, toNumber(item.qty));
        var discount = Math.min(100, Math.max(0, toNumber(item.discountPct)));
        var cycle = item.billingCycle || "monthly";
        var isAnnual = cycle === "annual";
        var arrRate = isAnnual ? unit.annual : unit.monthly;
        var listAnnualTotal = arrRate * qty * 12;
        var annualTotal = listAnnualTotal * (1 - discount / 100);
        var margin = Math.min(100, Math.max(0, toNumber(item.marginPct)));
        var partnerCost = annualTotal * (1 - margin / 100);
        // Unit Price always shows the flat per-month rate (the annual-commit monthly-equivalent, or
        // the month-to-month rate) - never multiplied by the invoicing cadence, so a quarterly/
        // half-yearly item doesn't look like it costs 3x/6x more per unit. Invoice Value is the
        // actual amount charged for one full billing cycle at that rate (12 months for annual,
        // 1/3/6 otherwise), which is why it - not Unit Price - reflects the billing terms.
        var termMonths = BILLING_CYCLE_MONTHS[cycle] || 1;
        var cadenceUnitPrice = isAnnual ? unit.annual : unit.monthly;
        var invoiceValue = cadenceUnitPrice * termMonths * qty * (1 - discount / 100);
        return {
            unit: unit,
            cadenceUnitPrice: cadenceUnitPrice,
            listAnnualTotal: listAnnualTotal,
            annualTotal: annualTotal,
            invoiceValue: invoiceValue,
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

    // The fixed-rate USD equivalent of an ARR figure, for a non-USD currency. Returns null for USD
    // (already in USD, nothing to convert).
    function arrInUsd(totalArr) {
        var rate = USD_CONVERSION_RATES[appState.currency];
        return rate ? totalArr * rate : null;
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
        els.compareCheckbox = shadowRoot.getElementById("compareCheckbox");
        els.comparePanel = shadowRoot.getElementById("comparePanel");
        els.comparePickList = shadowRoot.getElementById("comparePickList");
        els.prorationCheckbox = shadowRoot.getElementById("prorationCheckbox");
        els.prorationPanel = shadowRoot.getElementById("prorationPanel");
        els.prorationCycleSelect = shadowRoot.getElementById("prorationCycleSelect");
        els.prorationChangeDate = shadowRoot.getElementById("prorationChangeDate");
        els.prorationEndDate = shadowRoot.getElementById("prorationEndDate");
        els.prorationResult = shadowRoot.getElementById("prorationResult");
        els.tbody = shadowRoot.getElementById("tbody");
        els.totalInvoiceRow = shadowRoot.getElementById("totalInvoiceRow");
        els.totalInvoiceValueCell = shadowRoot.getElementById("totalInvoiceValueCell");
        els.theadReseller = shadowRoot.getElementById("theadReseller");
        els.addPlanSelect = shadowRoot.getElementById("addPlanSelect");
        els.addPlanBtn = shadowRoot.getElementById("addPlanBtn");
        els.clearBtn = shadowRoot.getElementById("clearBtn");
        els.summarySection = shadowRoot.getElementById("summarySection");
        els.closeBtn = shadowRoot.getElementById("closeBtn");
        els.exportExcelBtn = shadowRoot.getElementById("exportExcelBtn");
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
        '  .billing-cycle-select { margin-top: 4px; font-size: 11px; padding: 2px 6px; }',
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
        '  .frsh-summary-item[title] { cursor: help; }',
        '  .frsh-summary-item .stat-value { font-size: 21px; font-weight: 700; margin-top: 3px; }',
        '  .frsh-summary-item .stat-sub { font-size: 13px; font-weight: 500; color: #a9a89e; }',
        '  .frsh-summary-item .stat-value.up { color: #4ee08a; }',
        '  .frsh-summary-item .stat-value.down { color: #ff8a7a; }',
        '  .frsh-quote-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }',
        '  .quote-tab-track { display: inline-flex; flex-wrap: wrap; gap: 3px; border-radius: 999px; padding: 3px; background: #f7f7f4; border: 1px solid #e3e2da; }',
        '  .quote-tab { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; color: #63625a; border-radius: 999px; padding: 6px 8px 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab.active { background: #0387ff; color: #fff; }',
        '  .tab-current-badge { background: #00ac4b; color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 700; }',
        '  .tab-remove { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; opacity: 0.6; }',
        '  .tab-remove:hover { opacity: 1; background: rgba(255,90,78,0.2); }',
        '  .quote-tab-add { border: 1px dashed #a9a89e; background: transparent; color: #63625a; border-radius: 999px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab-add:hover { border-color: #101114; color: #101114; }',
        '  .frsh-toggle-group { display: flex; align-items: center; gap: 16px; margin-left: auto; flex-wrap: wrap; }',
        '  .frsh-current-toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #63625a; font-weight: 600; cursor: pointer; }',
        '  .frsh-compare-panel { border: 1px solid #e3e2da; border-radius: 14px; padding: 14px 16px; background: #fff; margin-bottom: 18px; }',
        '  .frsh-compare-title { font-size: 12px; font-weight: 700; color: #63625a; margin-bottom: 10px; }',
        '  .frsh-compare-list { display: flex; flex-wrap: wrap; gap: 8px 20px; }',
        '  .compare-row { display: flex; align-items: center; gap: 12px; }',
        '  .compare-check { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }',
        '  .compare-current-radio { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #63625a; font-weight: 600; cursor: pointer; }',
        '  .proration-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }',
        '  .proration-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #63625a; }',
        '  .proration-field select { min-width: 140px; }',
        '  .proration-result { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #f0efe8; font-size: 13px; color: #63625a; }',
        '  .proration-result strong { display: block; font-size: 19px; font-weight: 700; color: #101114; margin-top: 2px; }',
        '  .proration-note { margin-top: 10px; font-size: 11.5px; color: #a9a89e; }',
        '  tfoot td { border-bottom: none; border-top: 2px solid #e3e2da; padding-top: 12px; }',
        '  .total-invoice-label { font-weight: 700; color: #101114; }',
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
        '      <div class="frsh-segmented" id="customerType" title="Switch whether this quote is for a direct customer or a reseller partner">',
        '        <button type="button" data-value="direct" class="active">Direct Customer</button>',
        '        <button type="button" data-value="reseller">Reseller Customer</button>',
        '      </div>',
        '      <div title="Change the currency shown for every quote">',
        '        <span class="frsh-field-label">Currency</span>',
        '        <select id="currencySelect">',
        '          <option value="USD">USD</option>',
        '          <option value="EUR">EUR</option>',
        '          <option value="GBP">GBP</option>',
        '          <option value="INR">INR</option>',
        '          <option value="AUD">AUD</option>',
        '        </select>',
        '      </div>',
        '      <div class="frsh-toggle-group">',
        '        <label class="frsh-current-toggle" title="Pick two quotes to compare and mark one as the current subscription"><input type="checkbox" id="compareCheckbox">Compare Prices</label>',
        '        <label class="frsh-current-toggle" title="Calculate a prorated charge for one line item between two dates"><input type="checkbox" id="prorationCheckbox">Calculate Prorated Charges</label>',
        '      </div>',
        '    </div>',
        '    <div class="frsh-compare-panel" id="comparePanel" hidden>',
        '      <div class="frsh-compare-title">Pick two quotes to compare, then mark one as the current subscription</div>',
        '      <div id="comparePickList" class="frsh-compare-list"></div>',
        '    </div>',
        '    <div class="frsh-compare-panel" id="prorationPanel" hidden>',
        '      <div class="frsh-compare-title">Estimate a prorated value for this quote between two dates</div>',
        '      <div class="proration-row">',
        '        <label class="proration-field">Billing Cycle',
        '          <select id="prorationCycleSelect" title="The cadence this quote is invoiced on">',
        '            <option value="annual">Annual</option>',
        '            <option value="monthly">Monthly</option>',
        '            <option value="quarterly">Quarterly</option>',
        '            <option value="halfyearly">Half-yearly</option>',
        '          </select>',
        '        </label>',
        '        <label class="proration-field">Subscription Change Date',
        '          <input type="date" id="prorationChangeDate" title="The date the subscription change takes effect">',
        '        </label>',
        '        <label class="proration-field">Subscription End Date',
        '          <input type="date" id="prorationEndDate" title="The date the current billing cycle ends">',
        '        </label>',
        '      </div>',
        '      <div class="proration-result" id="prorationResult"></div>',
        '      <div class="proration-note">Estimate only - actual prorated charges depend on the exact date and time of invoicing.</div>',
        '    </div>',
        '    <div class="frsh-card">',
        '    <table>',
        '      <thead>',
        '        <tr>',
        '          <th>Item</th>',
        '          <th class="num" title="Number of licenses on this line">Qty</th>',
        '          <th class="num" title="Flat per-month rate, regardless of billing cycle">Unit Price</th>',
        '          <th class="num" title="Discount percentage applied to this line">Discount %</th>',
        '          <th class="num" title="The amount actually charged for one full billing cycle at the chosen terms">Invoice Value</th>',
        '          <th class="num reseller-col" id="theadReseller" hidden title="Percentage the partner keeps as margin over the annual cost">Margin %</th>',
        '          <th class="num reseller-col" id="theadResellerCost" hidden title="Annual cost after the partner margin is applied">Partner cost</th>',
        '          <th></th>',
        '        </tr>',
        '      </thead>',
        '      <tbody id="tbody"></tbody>',
        '      <tfoot id="totalInvoiceRow" hidden>',
        '        <tr>',
        '          <td colspan="4" class="total-invoice-label" title="Sum of every line item\'s Invoice Value, each at its own billing cycle">Total Invoice Value</td>',
        '          <td class="num total-invoice-label" id="totalInvoiceValueCell"></td>',
        '          <td class="reseller-col" hidden></td>',
        '          <td class="reseller-col" hidden></td>',
        '          <td></td>',
        '        </tr>',
        '      </tfoot>',
        '    </table>',
        '    <div class="frsh-add-plan">',
        '      <select id="addPlanSelect" title="Choose a plan to add as a new line item"></select>',
        '      <button type="button" id="addPlanBtn" title="Add the selected plan as a new line item">+ Add plan</button>',
        '      <button type="button" id="clearBtn" class="frsh-clear-btn" title="Remove every line item from this quote">Clear quote</button>',
        '    </div>',
        '    </div>',
        '    <div class="frsh-summary" id="summarySection" hidden></div>',
        '    <div class="frsh-actions">',
        '      <button type="button" id="exportExcelBtn" class="frsh-action-btn" title="Download the quote(s) you choose as an Excel file">⬇ Download Excel</button>',
        '      <button type="button" id="exportEmailBtn" class="frsh-action-btn" title="Open a pre-filled email with the quote(s) you choose">✉ Email quote</button>',
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

        els.compareCheckbox.addEventListener("change", function() {
            appState.compare.enabled = els.compareCheckbox.checked;
            render();
        });

        // The compare panel lists every quote with a checkbox (pick up to two) and, once a quote is
        // picked, a radio button to mark it as the current subscription (the ARR delta baseline).
        els.comparePanel.addEventListener("change", function(e) {
            if (e.target.matches(".compare-pick")) {
                var id = Number(e.target.value);
                var ids = appState.compare.quoteIds;
                var pos = ids.indexOf(id);
                if (e.target.checked) {
                    if (pos === -1 && ids.length < 2) ids.push(id);
                } else if (pos !== -1) {
                    ids.splice(pos, 1);
                    var dropped = appState.quotes.filter(function(q) { return q.id === id; })[0];
                    if (dropped) dropped.isCurrent = false; // no longer part of a comparison, so it can't be the baseline
                }
                render();
            } else if (e.target.matches('input[name="compareCurrent"]')) {
                var currentId = Number(e.target.value);
                appState.quotes.forEach(function(q) { q.isCurrent = q.id === currentId; });
                render();
            }
        });

        els.prorationCheckbox.addEventListener("change", function() {
            appState.proration.enabled = els.prorationCheckbox.checked;
            render();
        });

        // Billing cycle picker, change date, and end date all live-recompute the result without a
        // full render() - a render() would rebuild the date inputs and drop whatever was just typed.
        els.prorationPanel.addEventListener("change", function(e) {
            if (e.target === els.prorationCycleSelect) {
                appState.proration.billingCycle = els.prorationCycleSelect.value;
                renderProrationResult();
            } else if (e.target === els.prorationChangeDate || e.target === els.prorationEndDate) {
                appState.proration.changeDate = els.prorationChangeDate.value;
                appState.proration.endDate = els.prorationEndDate.value;
                renderProrationResult();
            }
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

        els.exportExcelBtn.addEventListener("click", function() { openExportPanel("excel"); });
        els.exportEmailBtn.addEventListener("click", function() { openExportPanel("email"); });
        els.exportCancelBtn.addEventListener("click", closeExportPanel);
        els.exportConfirmBtn.addEventListener("click", function() {
            var plans = getPlans();
            var selected = getSelectedQuotesFromPanel();
            if (!plans || !selected.length) return;
            if (exportMode === "excel") downloadExcel(buildExcelHtml(selected, plans), "frsh-quote.xls");
            else if (exportMode === "email") openEmailCompose(selected, plans);
            closeExportPanel();
        });

        // Quote tabs: switch active quote, remove one, or start a new one.
        els.quoteTabs.addEventListener("click", function(e) {
            var removeBtn = e.target.closest(".tab-remove");
            if (removeBtn) {
                var idx = Number(removeBtn.getAttribute("data-index"));
                if (appState.quotes.length <= 1) return;
                var removedId = appState.quotes[idx].id;
                appState.quotes.splice(idx, 1);
                if (appState.activeIndex >= idx) appState.activeIndex = Math.max(0, appState.activeIndex - 1);
                // Drop the deleted quote from the comparison pair too, so it doesn't linger as a
                // dangling id once it no longer exists.
                var cmpIdx = appState.compare.quoteIds.indexOf(removedId);
                if (cmpIdx !== -1) appState.compare.quoteIds.splice(cmpIdx, 1);
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
            var name = window.prompt("Rename quote", quoteDisplayName(quote));
            if (name && name.trim()) {
                quote.customName = name.trim();
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
            var invoiceCell = row.querySelector(".cell-invoice");
            var partnerCell = row.querySelector(".cell-partner");
            if (invoiceCell) invoiceCell.textContent = money(computed.invoiceValue);
            if (partnerCell) partnerCell.textContent = money(computed.partnerCost);
            updateTotalInvoiceValue(plans);
            renderSummary();
        });

        // Billing cycle is freely editable after the item is added (not locked to whatever was
        // active on the page at right-click time) - changing it updates both the per-cycle unit
        // price and the Invoice Value cell, but never the ARR used in the summary/totals.
        els.tbody.addEventListener("change", function(e) {
            if (!e.target.matches(".billing-cycle-select")) return;
            var row = e.target.closest("tr[data-item-id]");
            if (!row) return;
            var id = Number(row.getAttribute("data-item-id"));
            var item = activeQuote().items.filter(function(it) { return it.id === id; })[0];
            if (!item) return;
            item.billingCycle = e.target.value;
            var plans = getPlans();
            if (!plans) return;
            var computed = computeRow(item, plans);
            var unitCell = row.querySelector(".cell-unit");
            var invoiceCell = row.querySelector(".cell-invoice");
            if (unitCell) unitCell.textContent = money(computed.cadenceUnitPrice);
            if (invoiceCell) invoiceCell.textContent = money(computed.invoiceValue);
            updateTotalInvoiceValue(plans);
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
                if (addon) addAddonItem(planItemId, addon, planItem.billingCycle);
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
        els.exportPanelTitle.textContent = mode === "excel" ? "Choose quotes to download" : "Choose quotes to email";
        els.exportConfirmBtn.textContent = mode === "excel" ? "Download Excel" : "Open email";
        var activeId = activeQuote().id;
        els.exportQuoteList.innerHTML = appState.quotes.map(function(q) {
            var checked = q.id === activeId ? " checked" : "";
            return '<label><input type="checkbox" class="export-quote-check" value="' + q.id + '"' + checked + ">" + escapeHtml(quoteDisplayName(q)) + (q.isCurrent ? " (current subscription)" : "") + "</label>";
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

    function itemLabel(item, plans) {
        if (item.kind === "plan") return getProductName() + " — " + plans[item.planIndex].planName;
        return item.name;
    }

    // A real .xls file (Excel's own "HTML table" import format) rather than CSV: no delimiter/locale
    // or encoding surprises when opened, columns always line up, and headers/totals can be bold.
    // "Invoice Value" is the per-row, per-billing-cycle amount (so mixed-cadence rows aren't
    // comparable) - the separate "Annualized Value (ARR)" column is what the TOTAL row sums, matching
    // the Total ARR shown in the app's own summary panel.
    function excelCell(v, bold) {
        var s = escapeHtml(String(v == null ? "" : v));
        return bold ? "<td style=\"font-weight:bold;\">" + s + "</td>" : "<td>" + s + "</td>";
    }

    function buildExcelHtml(selectedQuotes, plans) {
        var header = ["Quote", "Current Subscription", "Item", "Billing Cycle", "Qty", "Unit Price", "Discount %", "Invoice Value", "Annualized Value (ARR)", "Margin %", "Partner Cost"];
        var rows = ["<tr>" + header.map(function(h) { return "<th style=\"background:#101114;color:#fff;padding:6px 10px;text-align:left;\">" + escapeHtml(h) + "</th>"; }).join("") + "</tr>"];
        selectedQuotes.forEach(function(quote) {
            var name = quoteDisplayName(quote);
            quote.items.forEach(function(item) {
                var row = computeRow(item, plans);
                var isReseller = quote.customerType === "reseller";
                rows.push("<tr>" + [
                    excelCell(name), excelCell(quote.isCurrent ? "Yes" : ""), excelCell(itemLabel(item, plans)),
                    excelCell(BILLING_CYCLE_LABELS[item.billingCycle] || "Monthly"), excelCell(item.qty),
                    excelCell(fmt(row.cadenceUnitPrice)), excelCell(item.discountPct), excelCell(fmt(row.invoiceValue)),
                    excelCell(fmt(row.annualTotal)), excelCell(isReseller ? item.marginPct : ""), excelCell(isReseller ? fmt(row.partnerCost) : "")
                ].join("") + "</tr>");
            });
            var totals = totalsForQuote(quote, plans);
            rows.push("<tr>" + [
                excelCell(name, true), excelCell("", true), excelCell("TOTAL", true), excelCell("", true), excelCell("", true),
                excelCell("", true), excelCell("", true), excelCell("", true), excelCell(fmt(totals.totalArr), true),
                excelCell("", true), excelCell(quote.customerType === "reseller" ? fmt(totals.totalPartner) : "", true)
            ].join("") + "</tr>");
        });
        return "<html><head><meta charset=\"UTF-8\"></head><body><table border=\"1\" cellspacing=\"0\" cellpadding=\"4\">" + rows.join("") + "</table></body></html>";
    }

    function downloadExcel(html, filename) {
        var blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
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
            lines.push(quoteDisplayName(quote) + (quote.isCurrent ? " (current subscription)" : "") + (quote.customerType === "reseller" ? " [Reseller]" : ""));
            quote.items.forEach(function(item) {
                var row = computeRow(item, plans);
                lines.push("  - " + itemLabel(item, plans) + " x" + item.qty + " (" + (BILLING_CYCLE_LABELS[item.billingCycle] || "Monthly") + "): " + money(row.annualTotal) + "/yr");
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
        // char limit and point to the Excel download for the full line-item breakdown.
        if (body.length > 1500) {
            body = body.slice(0, 1500) + "\n\n[Quote truncated for email - use \"Download Excel\" for the full breakdown.]";
        }
        var mailto = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        // Setting location.href directly is the reliable way to hand off to the OS/browser's
        // registered mail handler - for a non-http(s) scheme like mailto: the browser triggers the
        // external handler and leaves the current page in place, it doesn't actually navigate away.
        // window.open() and a synthetic <a> click can both silently no-op for mailto: in some browsers.
        window.location.href = mailto;
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
        var totalListArr = 0, totalArr = 0, totalPartner = 0, totalInvoiceValue = 0;
        quote.items.forEach(function(it) {
            var row = computeRow(it, plans);
            totalListArr += row.listAnnualTotal;
            totalArr += row.annualTotal;
            totalPartner += row.partnerCost;
            totalInvoiceValue += row.invoiceValue;
        });
        return { totalListArr: totalListArr, totalArr: totalArr, totalPartner: totalPartner, totalInvoiceValue: totalInvoiceValue };
    }

    // Keeps the Total Invoice Value footer cell (and, if open, the prorated-value estimate that's
    // derived from it) in sync with a row-level edit, without a full render().
    function updateTotalInvoiceValue(plans) {
        if (!els.totalInvoiceValueCell || els.totalInvoiceRow.hidden) return;
        els.totalInvoiceValueCell.textContent = money(totalsForQuote(activeQuote(), plans).totalInvoiceValue);
        if (appState.proration.enabled) renderProrationResult();
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
        var html = '<div class="frsh-summary-item"><div class="stat-label">Total ARR</div><div class="stat-value">' + money(totals.totalArr) + "</div></div>";
        var usdArr = arrInUsd(totals.totalArr);
        if (usdArr !== null) {
            var rateNote = "Converted at 1 " + appState.currency + " = " + USD_CONVERSION_RATES[appState.currency] + " USD (fixed reference rate, not live)";
            html += '<div class="frsh-summary-item" title="' + escapeHtml(rateNote) + '"><div class="stat-label">ARR in USD</div><div class="stat-value">$' + fmt(usdArr) + "</div></div>";
        }
        html += '<div class="frsh-summary-item"><div class="stat-label">Total discount applied</div><div class="stat-value">' + money(totalDiscountAmount) + ' <span class="stat-sub">(' + fmt(totalDiscountPct) + '%)</span></div></div>';
        if (isReseller) {
            html += '<div class="frsh-summary-item"><div class="stat-label">Total partner cost</div><div class="stat-value">' + money(totals.totalPartner) + "</div></div>";
        }
        // The delta only appears when Compare Prices is on, exactly two quotes are picked, this quote
        // is one of them, and the other one is marked as the current subscription.
        var cmp = appState.compare;
        var inComparison = cmp.enabled && cmp.quoteIds.length === 2 && cmp.quoteIds.indexOf(quote.id) !== -1;
        var currentQuote = inComparison ? appState.quotes.filter(function(q) { return q.isCurrent && cmp.quoteIds.indexOf(q.id) !== -1; })[0] : null;
        if (currentQuote && currentQuote.id !== quote.id) {
            var baseline = totalsForQuote(currentQuote, plans);
            var delta = totals.totalArr - baseline.totalArr;
            var deltaPct = baseline.totalArr > 0 ? (delta / baseline.totalArr * 100) : (delta === 0 ? 0 : 100);
            var sign = delta >= 0 ? "+" : "−";
            var cls = delta >= 0 ? "up" : "down";
            html += '<div class="frsh-summary-item"><div class="stat-label">ARR vs "' + escapeHtml(quoteDisplayName(currentQuote)) + '"</div><div class="stat-value ' + cls + '">' + sign + money(Math.abs(delta)) + ' <span class="stat-sub">(' + sign + fmt(Math.abs(deltaPct)) + "%)</span></div></div>";
        }
        els.summarySection.hidden = false;
        els.summarySection.innerHTML = html;
    }

    function renderTabs() {
        if (!els.quoteTabs) return;
        var html = appState.quotes.map(function(q, i) {
            var active = i === appState.activeIndex ? " active" : "";
            var badge = q.isCurrent ? '<span class="tab-current-badge">Current</span>' : "";
            var remove = appState.quotes.length > 1 ? '<span class="tab-remove" data-index="' + i + '" aria-label="Remove quote" title="Remove this quote">✕</span>' : "";
            return '<button type="button" class="quote-tab' + active + '" data-index="' + i + '" title="Double-click to rename this quote">' + escapeHtml(quoteDisplayName(q)) + badge + remove + "</button>";
        }).join("");
        els.quoteTabs.innerHTML = '<div class="quote-tab-track">' + html + '</div><button type="button" id="newQuoteBtn" class="quote-tab-add" title="Start a new quote to compare against this one">+ New quote</button>';
    }

    // Lets the user pick exactly two quotes to compare (checkboxes disable once two are picked) and,
    // for each picked quote, mark it as the current subscription - the ARR delta baseline the other
    // picked quote is measured against.
    function renderComparePanel() {
        if (!els.comparePanel) return;
        els.comparePanel.hidden = !appState.compare.enabled;
        if (!appState.compare.enabled) return;
        var ids = appState.compare.quoteIds;
        els.comparePickList.innerHTML = appState.quotes.map(function(q) {
            var picked = ids.indexOf(q.id) !== -1;
            var checkedAttr = picked ? " checked" : "";
            var disabledAttr = (!picked && ids.length >= 2) ? " disabled" : "";
            var currentControl = picked ?
                '<label class="compare-current-radio" title="Use this quote as the baseline the other one is compared against"><input type="radio" name="compareCurrent" value="' + q.id + '"' + (q.isCurrent ? " checked" : "") + '>Current subscription</label>' : "";
            return '<div class="compare-row">' +
                '<label class="compare-check" title="Pick this quote to compare (max 2)"><input type="checkbox" class="compare-pick" value="' + q.id + '"' + checkedAttr + disabledAttr + '>' + escapeHtml(quoteDisplayName(q)) + "</label>" +
                currentControl +
                "</div>";
        }).join("");
    }

    // Lets the user estimate a prorated value for the whole quote (its Total Invoice Value) between
    // two dates - e.g. a mid-cycle upgrade, downgrade, or cancellation - using the fraction of the
    // chosen billing cycle that falls between the change date and the end date. This is scoped to
    // the overall quote rather than one line item, so there's no per-item picker.
    function renderProrationPanel() {
        if (!els.prorationPanel) return;
        els.prorationPanel.hidden = !appState.proration.enabled;
        if (!appState.proration.enabled) return;
        els.prorationCycleSelect.value = appState.proration.billingCycle;
        els.prorationChangeDate.value = appState.proration.changeDate;
        els.prorationEndDate.value = appState.proration.endDate;
        renderProrationResult();
    }

    function renderProrationResult() {
        if (!els.prorationResult) return;
        var plans = getPlans();
        if (!plans || !activeQuote().items.length) {
            els.prorationResult.textContent = "Add a line item to this quote first.";
            return;
        }
        if (!appState.proration.changeDate || !appState.proration.endDate) {
            els.prorationResult.textContent = "Enter both dates to estimate the prorated value.";
            return;
        }
        var changeMs = new Date(appState.proration.changeDate + "T00:00:00").getTime();
        var endMs = new Date(appState.proration.endDate + "T00:00:00").getTime();
        if (isNaN(changeMs) || isNaN(endMs)) {
            els.prorationResult.textContent = "Enter valid dates to estimate the prorated value.";
            return;
        }
        var totalInvoiceValue = totalsForQuote(activeQuote(), plans).totalInvoiceValue;
        var cycle = appState.proration.billingCycle || "annual";
        // A flat 30-day month, matching the same month-count model the rest of the app already uses
        // for billing cycles (annual = 12x monthly, quarterly = 3x, etc.) rather than mixing in
        // calendar-accurate month lengths.
        var msPerDay = 24 * 60 * 60 * 1000;
        var cycleMs = (BILLING_CYCLE_MONTHS[cycle] || 1) * 30 * msPerDay;
        var spanMs = endMs - changeMs;
        var fraction = cycleMs > 0 ? Math.max(0, Math.min(1, spanMs / cycleMs)) : 0;
        var estimatedAmount = totalInvoiceValue * fraction;
        var cycleDays = Math.round(cycleMs / msPerDay);
        var spanDays = Math.max(0, Math.min(cycleDays, Math.round(spanMs / msPerDay)));
        els.prorationResult.innerHTML = "Estimated prorated value<strong>" + money(estimatedAmount) + "</strong>" +
            "<div>" + spanDays + " of " + cycleDays + " days in the " + BILLING_CYCLE_LABELS[cycle].toLowerCase() + " cycle (" + fmt(fraction * 100) + "%) &middot; Total Invoice Value " + money(totalInvoiceValue) + "</div>";
    }

    function render() {
        if (!shadowRoot) return;
        var plans = getPlans();
        var quote = activeQuote();
        els.productName.textContent = getProductName();
        renderTabs();
        els.compareCheckbox.checked = appState.compare.enabled;
        renderComparePanel();
        els.prorationCheckbox.checked = appState.proration.enabled;
        renderProrationPanel();

        [].forEach.call(els.customerType.querySelectorAll("button"), function(b) {
            b.classList.toggle("active", b.getAttribute("data-value") === quote.customerType);
        });
        var isReseller = quote.customerType === "reseller";
        [].forEach.call(shadowRoot.querySelectorAll(".reseller-col"), function(el) { el.hidden = !isReseller; });

        if (!plans) {
            els.tbody.innerHTML = '<tr><td colspan="8" class="frsh-empty">Could not read pricing data on this page.</td></tr>';
            els.totalInvoiceRow.hidden = true;
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
            els.totalInvoiceRow.hidden = true;
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
            els.totalInvoiceRow.hidden = false;
            els.totalInvoiceValueCell.textContent = money(totalsForQuote(quote, plans).totalInvoiceValue);
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
        return '<td class="num"><input type="number" class="margin-input" min="0" max="100" step="1" value="' + item.marginPct + '" title="Percentage the partner keeps as margin over the annual cost"></td>' +
            '<td class="num cell-partner">' + money(row.partnerCost) + "</td>";
    }

    // Always a live dropdown - billing cycle isn't locked to whatever was active on the page when
    // the item was added, the user can change it (and the unit price / invoice value update).
    function cadenceControlHtml(item) {
        var options = ["annual", "monthly", "quarterly", "halfyearly"].map(function(c) {
            var selected = (item.billingCycle || "monthly") === c ? " selected" : "";
            return '<option value="' + c + '"' + selected + ">" + BILLING_CYCLE_LABELS[c] + "</option>";
        }).join("");
        return '<select class="billing-cycle-select" aria-label="Billing cycle" title="Change how this line item is invoiced">' + options + "</select>";
    }

    function renderPlanRow(item, plans, isReseller) {
        var plan = plans[item.planIndex];
        var row = computeRow(item, plans);
        return '<tr data-item-id="' + item.id + '">' +
            '<td><div class="item-name">' + escapeHtml(getProductName()) + " — " + escapeHtml(plan.planName) + "</div>" +
            cadenceControlHtml(item) + "</td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '" title="Number of licenses"></td>' +
            '<td class="num cell-unit">' + money(row.cadenceUnitPrice) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '" title="Discount percentage for this line"></td>' +
            '<td class="num cell-invoice">' + money(row.invoiceValue) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove" title="Remove this line item">✕</button></td>' +
            "</tr>";
    }

    function renderAddonRow(item, plans, isReseller) {
        var row = computeRow(item, plans);
        return '<tr data-item-id="' + item.id + '" class="addon-row">' +
            '<td><div class="item-name">' + escapeHtml(item.name) + "</div>" +
            cadenceControlHtml(item) + "</td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '" title="Number of licenses"></td>' +
            '<td class="num cell-unit">' + money(row.cadenceUnitPrice) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '" title="Discount percentage for this line"></td>' +
            '<td class="num cell-invoice">' + money(row.invoiceValue) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove" title="Remove this line item">✕</button></td>' +
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
            '<select id="addon-select-' + planItem.id + '" title="Choose an addon valid for this plan">' + options + "</select>" +
            '<button type="button" class="add-addon-btn" data-plan-item-id="' + planItem.id + '" title="Add the selected addon to this plan">+ Add addon</button>' +
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
