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

    // Billing cycle is a per-quote setting (every line item in a quote is invoiced on the same
    // cadence - a customer isn't billed monthly for one line and annually for another within the
    // same subscription), always user-editable after the quote is started rather than fixed to
    // however the page was toggled at right-click time.
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
    // just alternative scenarios) so they can be compared side by side. Any
    // quote can be flagged as the customer's current subscription (isCurrent,
    // set via the star toggle on its tab - independent of Compare Prices).
    // "Compare Prices" separately picks exactly two quotes (compare.quoteIds)
    // to show an ARR delta between; if one of the two happens to be marked
    // current, the delta label calls that out, but marking one isn't required
    // to compare. Currency is shared across all quotes so that delta is
    // meaningful. Prorated Charges, by contrast, is scoped to one quote at a
    // time (its own toggle/dates live on the quote object) since it estimates
    // a value for that quote specifically.
    // ---------------------------------------------------------------------
    var appState = {
        currency: "USD",
        quotes: [],
        activeIndex: 0,
        compare: { enabled: false, quoteIds: [] } // quoteIds: up to 2 quote ids being compared
    };
    var nextItemId = 1;
    var nextQuoteId = 1;

    function newQuote() {
        return {
            id: nextQuoteId++, // stable internal identity, never reused
            customName: null, // set only once the user renames the tab; otherwise the display name is derived live from position
            isCurrent: false,
            customerType: "direct", // "direct" | "reseller"
            billingCycle: "annual", // shared by every line item in this quote
            proration: { enabled: false, changeDate: "", endDate: "" },
            items: []
        };
    }

    // Clones a quote (billing cycle, customer type, and every line item) into a new tab, so the
    // user can start from an existing scenario instead of rebuilding it - e.g. to try a discount
    // variant or a different billing cycle side by side with the original.
    function duplicateQuote(source) {
        var copy = newQuote();
        copy.billingCycle = source.billingCycle;
        copy.customerType = source.customerType;
        copy.customName = source.customName ? (source.customName + " copy") : null;
        var idMap = {};
        copy.items = source.items.map(function(it) {
            var clone = JSON.parse(JSON.stringify(it));
            idMap[clone.id] = nextItemId++;
            clone.id = idMap[clone.id];
            return clone;
        });
        copy.items.forEach(function(clone) {
            if (clone.kind === "addon") clone.parentItemId = idMap[clone.parentItemId];
        });
        appState.quotes.push(copy);
        appState.activeIndex = appState.quotes.length - 1;
        return copy;
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
        var quote = activeQuote();
        // Only the first item in an otherwise-empty quote picks up the page's own Monthly/Annually
        // toggle - once the quote has a billing cycle, every later add sticks to it, since a
        // subscription can't be billed on two different cadences at once.
        if (!quote.items.length) quote.billingCycle = getAnnualTermFromPage() ? "annual" : "monthly";
        var item = {
            id: nextItemId++,
            kind: "plan",
            planIndex: planIndex,
            planName: plan.planName,
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        quote.items.push(item);
        return item;
    }

    function addAddonItem(parentItemId, addon) {
        var item = {
            id: nextItemId++,
            kind: "addon",
            parentItemId: parentItemId,
            name: addon.name,
            localePrices: addon.localePrices,
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
    // month-to-month rate x 12. Invoice Value is the discounted amount actually charged per billing
    // cycle (what shows in the table row) - since every item in a quote now shares the same cycle,
    // Invoice Values are meaningfully comparable/summable within one quote.
    function computeRow(item, quote, plans) {
        var unit = unitPricesFor(item, plans);
        var qty = Math.max(0, toNumber(item.qty));
        var discount = Math.min(100, Math.max(0, toNumber(item.discountPct)));
        var cycle = quote.billingCycle || "annual";
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
        els.billingCycleSelect = shadowRoot.getElementById("billingCycleSelect");
        els.compareCheckbox = shadowRoot.getElementById("compareCheckbox");
        els.comparePanel = shadowRoot.getElementById("comparePanel");
        els.comparePickList = shadowRoot.getElementById("comparePickList");
        els.prorationCheckbox = shadowRoot.getElementById("prorationCheckbox");
        els.prorationPanel = shadowRoot.getElementById("prorationPanel");
        els.prorationTitle = shadowRoot.getElementById("prorationTitle");
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
        '  .item-name .plan-select { font-weight: 600; min-width: 150px; max-width: 240px; }',
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
        '  .frsh-tabs-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }',
        '  .frsh-quote-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 0; }',
        '  .frsh-compare-toggle { white-space: nowrap; }',
        '  .quote-tab-track { display: inline-flex; flex-wrap: wrap; gap: 3px; border-radius: 999px; padding: 3px; background: #f7f7f4; border: 1px solid #e3e2da; }',
        '  .quote-tab { display: inline-flex; align-items: center; gap: 5px; border: none; background: transparent; color: #63625a; border-radius: 999px; padding: 6px 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab.active { background: #0387ff; color: #fff; }',
        '  .tab-current-toggle { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; opacity: 0.5; font-size: 12px; }',
        '  .tab-current-toggle:hover { opacity: 0.9; }',
        '  .tab-current-toggle.current { opacity: 1; color: #00ac4b; }',
        '  .quote-tab.active .tab-current-toggle.current { color: #baffd8; }',
        '  .tab-duplicate, .tab-remove { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; opacity: 0.6; font-size: 12px; }',
        '  .tab-duplicate:hover { opacity: 1; background: rgba(3,135,255,0.2); }',
        '  .tab-remove:hover { opacity: 1; background: rgba(255,90,78,0.2); }',
        '  .quote-tab-add { border: 1px dashed #a9a89e; background: transparent; color: #63625a; border-radius: 999px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }',
        '  .quote-tab-add:hover { border-color: #101114; color: #101114; }',
        '  .frsh-current-toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #63625a; font-weight: 600; cursor: pointer; }',
        '  .frsh-compare-panel { border: 1px solid #e3e2da; border-radius: 14px; padding: 14px 16px; background: #fff; margin-bottom: 18px; }',
        '  .frsh-compare-title { font-size: 12px; font-weight: 700; color: #63625a; margin-bottom: 10px; }',
        '  .frsh-compare-list { display: flex; flex-wrap: wrap; gap: 8px 20px; }',
        '  .compare-row { display: flex; align-items: center; gap: 12px; }',
        '  .compare-check { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }',
        '  .proration-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }',
        '  .proration-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #63625a; }',
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
        '    <div class="frsh-tabs-row">',
        '      <div class="frsh-quote-tabs" id="quoteTabs"></div>',
        '      <label class="frsh-current-toggle frsh-compare-toggle" title="Pick two quotes to compare their ARR"><input type="checkbox" id="compareCheckbox">Compare Prices</label>',
        '    </div>',
        '    <div class="frsh-compare-panel" id="comparePanel" hidden>',
        '      <div class="frsh-compare-title">Pick two quotes to compare. Use the ★ on a tab to mark it as the customer\'s current subscription.</div>',
        '      <div id="comparePickList" class="frsh-compare-list"></div>',
        '    </div>',
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
        '      <div title="Every line item in this quote is invoiced on the same cycle">',
        '        <span class="frsh-field-label">Billing Cycle</span>',
        '        <select id="billingCycleSelect">',
        '          <option value="annual">Annual</option>',
        '          <option value="monthly">Monthly</option>',
        '          <option value="quarterly">Quarterly</option>',
        '          <option value="halfyearly">Half-yearly</option>',
        '        </select>',
        '      </div>',
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
        '          <td colspan="4" class="total-invoice-label" title="Sum of every line item\'s Invoice Value for this quote\'s billing cycle">Total Invoice Value</td>',
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
        '      <label class="frsh-current-toggle" title="Estimate a prorated value for this quote between two dates"><input type="checkbox" id="prorationCheckbox">Calculate Prorated Charges</label>',
        '      <button type="button" id="clearBtn" class="frsh-clear-btn" title="Remove every line item from this quote">Clear quote</button>',
        '    </div>',
        '    <div class="frsh-compare-panel" id="prorationPanel" hidden>',
        '      <div class="frsh-compare-title" id="prorationTitle">Estimate a prorated value for this quote between two dates</div>',
        '      <div class="proration-row">',
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

        els.billingCycleSelect.addEventListener("change", function() {
            activeQuote().billingCycle = els.billingCycleSelect.value;
            render();
        });

        els.compareCheckbox.addEventListener("change", function() {
            appState.compare.enabled = els.compareCheckbox.checked;
            render();
        });

        // The compare panel just lists every quote with a checkbox (pick up to two) - marking a
        // quote as the current subscription is a separate action (the ★ on its tab), not required
        // to compare two quotes' prices.
        els.comparePanel.addEventListener("change", function(e) {
            if (!e.target.matches(".compare-pick")) return;
            var id = Number(e.target.value);
            var ids = appState.compare.quoteIds;
            var pos = ids.indexOf(id);
            if (e.target.checked) {
                if (pos === -1 && ids.length < 2) ids.push(id);
            } else if (pos !== -1) {
                ids.splice(pos, 1);
            }
            render();
        });

        els.prorationCheckbox.addEventListener("change", function() {
            activeQuote().proration.enabled = els.prorationCheckbox.checked;
            render();
        });

        // Change date and end date live-recompute the result without a full render() - a render()
        // would rebuild the date inputs and drop whatever was just typed.
        els.prorationPanel.addEventListener("change", function(e) {
            if (e.target !== els.prorationChangeDate && e.target !== els.prorationEndDate) return;
            var proration = activeQuote().proration;
            proration.changeDate = els.prorationChangeDate.value;
            proration.endDate = els.prorationEndDate.value;
            renderProrationResult();
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
            var currentToggle = e.target.closest(".tab-current-toggle");
            if (currentToggle) {
                var toggleIdx = Number(currentToggle.getAttribute("data-index"));
                var toggleQuote = appState.quotes[toggleIdx];
                if (toggleQuote) {
                    var wasCurrent = toggleQuote.isCurrent;
                    appState.quotes.forEach(function(q) { q.isCurrent = false; });
                    toggleQuote.isCurrent = !wasCurrent; // clicking the current quote's star unmarks it
                    render();
                }
                return;
            }
            var duplicateBtn = e.target.closest(".tab-duplicate");
            if (duplicateBtn) {
                var dupIdx = Number(duplicateBtn.getAttribute("data-index"));
                if (appState.quotes[dupIdx]) duplicateQuote(appState.quotes[dupIdx]);
                render();
                return;
            }
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
            var computed = computeRow(item, activeQuote(), plans);
            var invoiceCell = row.querySelector(".cell-invoice");
            var partnerCell = row.querySelector(".cell-partner");
            if (invoiceCell) invoiceCell.textContent = money(computed.invoiceValue);
            if (partnerCell) partnerCell.textContent = money(computed.partnerCost);
            updateTotalInvoiceValue(plans);
            renderSummary();
        });

        // Switching a line item's plan keeps its licenses, discount, and margin as-is - only the
        // plan reference changes. Any already-added addon that isn't valid for the new plan is
        // dropped, since the addon list itself is plan-specific.
        els.tbody.addEventListener("change", function(e) {
            if (!e.target.matches(".plan-select")) return;
            var row = e.target.closest("tr[data-item-id]");
            if (!row) return;
            var id = Number(row.getAttribute("data-item-id"));
            var item = activeQuote().items.filter(function(it) { return it.id === id; })[0];
            if (!item) return;
            var plans = getPlans();
            var newPlan = plans && plans[Number(e.target.value)];
            if (!newPlan) return;
            item.planIndex = Number(e.target.value);
            item.planName = newPlan.planName;
            var validAddonNames = {};
            planAddons(newPlan).forEach(function(a) { validAddonNames[a.name] = true; });
            activeQuote().items = activeQuote().items.filter(function(it) {
                return it.parentItemId !== item.id || validAddonNames[it.name];
            });
            render();
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
                if (addon) addAddonItem(planItemId, addon);
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
    // Columns mirror the standard quote-table layout: per-license monthly rate, the discounted
    // per-license monthly rate, the equivalent Monthly Cost (qty x discounted rate), and the
    // annualized total - in the quote's currency, plus a fixed-rate USD column when that currency
    // isn't already USD.
    function excelCell(v, bold) {
        var s = escapeHtml(String(v == null ? "" : v));
        return bold ? "<td style=\"font-weight:bold;\">" + s + "</td>" : "<td>" + s + "</td>";
    }

    function discountedUnitPriceFor(row, item) {
        var discount = Math.min(100, Math.max(0, toNumber(item.discountPct)));
        return row.cadenceUnitPrice * (1 - discount / 100);
    }

    function buildExcelHtml(selectedQuotes, plans) {
        var cur = appState.currency;
        var showUsd = cur !== "USD";
        var showReseller = selectedQuotes.some(function(q) { return q.customerType === "reseller"; });
        var header = ["Quote", "Current Subscription", "Product/Plan", "No. of Units",
            "Price/License/Month (" + cur + ")", "Discount",
            "Discounted Price/License/Month (" + cur + ")", "Monthly Cost (" + cur + ")", "Annual (" + cur + ")"];
        if (showUsd) header.push("Annual (USD)");
        if (showReseller) header.push("Margin %", "Partner Cost");
        var rows = ["<tr>" + header.map(function(h) { return "<th style=\"background:#101114;color:#fff;padding:6px 10px;text-align:left;\">" + escapeHtml(h) + "</th>"; }).join("") + "</tr>"];
        selectedQuotes.forEach(function(quote) {
            var name = quoteDisplayName(quote);
            var isReseller = quote.customerType === "reseller";
            quote.items.forEach(function(item) {
                var row = computeRow(item, quote, plans);
                var monthlyCost = row.annualTotal / 12;
                var cells = [
                    excelCell(name), excelCell(quote.isCurrent ? "Yes" : ""), excelCell(itemLabel(item, plans)), excelCell(item.qty),
                    excelCell(fmt(row.cadenceUnitPrice)), excelCell(item.discountPct + "%"),
                    excelCell(fmt(discountedUnitPriceFor(row, item))), excelCell(fmt(monthlyCost)), excelCell(fmt(row.annualTotal))
                ];
                if (showUsd) cells.push(excelCell(fmt(row.annualTotal * USD_CONVERSION_RATES[cur])));
                if (showReseller) cells.push(excelCell(isReseller ? item.marginPct : ""), excelCell(isReseller ? fmt(row.partnerCost) : ""));
                rows.push("<tr>" + cells.join("") + "</tr>");
            });
            var totals = totalsForQuote(quote, plans);
            var totalCells = [
                excelCell(name, true), excelCell("", true), excelCell("TOTAL", true), excelCell("", true),
                excelCell("", true), excelCell("", true), excelCell("", true), excelCell("", true), excelCell(fmt(totals.totalArr), true)
            ];
            if (showUsd) totalCells.push(excelCell(fmt(totals.totalArr * USD_CONVERSION_RATES[cur]), true));
            if (showReseller) totalCells.push(excelCell("", true), excelCell(isReseller ? fmt(totals.totalPartner) : "", true));
            rows.push("<tr>" + totalCells.join("") + "</tr>");
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

    function padRight(v, w) {
        var s = String(v == null ? "" : v);
        return s.length >= w ? s.slice(0, w) : s + new Array(w - s.length + 1).join(" ");
    }

    function padLeft(v, w) {
        var s = String(v == null ? "" : v);
        return s.length >= w ? s.slice(0, w) : new Array(w - s.length + 1).join(" ") + s;
    }

    // mailto: bodies are plain text only - no mail client renders HTML/CSS in them - so this is the
    // closest a table can get: a fixed-width, space-aligned layout using the same columns as the
    // Excel download. Alignment holds as long as the recipient's client shows plain text in a
    // monospace font (most desktop clients do); it can drift in one that doesn't.
    function buildEmailBody(selectedQuotes, plans) {
        var cur = appState.currency;
        var showUsd = cur !== "USD";
        var cols = [
            { key: "item", label: "Product/Plan", width: 22, align: "left" },
            { key: "qty", label: "Units", width: 5, align: "right" },
            { key: "price", label: "Price/Lic/Mo", width: 12, align: "right" },
            { key: "disc", label: "Disc", width: 5, align: "right" },
            { key: "discPrice", label: "Disc.Price/Mo", width: 13, align: "right" },
            { key: "monthly", label: "Monthly Cost", width: 12, align: "right" },
            { key: "annual", label: "Annual", width: 12, align: "right" }
        ];
        if (showUsd) cols.push({ key: "annualUsd", label: "Annual (USD)", width: 12, align: "right" });

        function formatRow(values) {
            return cols.map(function(c) {
                var v = values[c.key];
                return c.align === "left" ? padRight(v, c.width) : padLeft(v, c.width);
            }).join(" | ");
        }

        var lines = [getProductName() + " - Quote Summary", ""];
        selectedQuotes.forEach(function(quote) {
            var cycleLabel = BILLING_CYCLE_LABELS[quote.billingCycle] || "Annual";
            lines.push(quoteDisplayName(quote) + " (" + cycleLabel + ", billed in " + cur + ")" + (quote.isCurrent ? " - current subscription" : "") + (quote.customerType === "reseller" ? " [Reseller]" : ""));
            var headerLabels = {};
            cols.forEach(function(c) { headerLabels[c.key] = c.label; });
            lines.push(formatRow(headerLabels));
            lines.push(cols.map(function(c) { return new Array(c.width + 1).join("-"); }).join("-+-"));
            quote.items.forEach(function(item) {
                var row = computeRow(item, quote, plans);
                lines.push(formatRow({
                    item: itemLabel(item, plans),
                    qty: item.qty,
                    price: fmt(row.cadenceUnitPrice),
                    disc: item.discountPct + "%",
                    discPrice: fmt(discountedUnitPriceFor(row, item)),
                    monthly: fmt(row.annualTotal / 12),
                    annual: fmt(row.annualTotal),
                    annualUsd: showUsd ? fmt(row.annualTotal * USD_CONVERSION_RATES[cur]) : ""
                }));
            });
            var totals = totalsForQuote(quote, plans);
            lines.push(formatRow({
                item: "TOTAL", qty: "", price: "", disc: "", discPrice: "", monthly: "",
                annual: fmt(totals.totalArr),
                annualUsd: showUsd ? fmt(totals.totalArr * USD_CONVERSION_RATES[cur]) : ""
            }));
            if (quote.customerType === "reseller") lines.push("  Total partner cost: " + money(totals.totalPartner));
            lines.push("");
        });
        lines.push("Estimate only, generated from the pricing shown on the Freshworks pricing page. Not a binding quote.");
        return lines.join("\n");
    }

    // Several OSes/browsers silently drop a mailto: handoff once the URL - after percent-encoding -
    // gets too long (commonly cited around ~2000 chars); the fixed-width table's padding spaces each
    // balloon to "%20" (3 chars) when encoded, so budgeting off the raw body length (as opposed to
    // the encoded length) let past rounds' truncation undercount badly and silently fail. This stays
    // under a conservative cap by budgeting off the actual encoded length instead.
    var MAX_MAILTO_LENGTH = 1800;

    function openEmailCompose(selectedQuotes, plans) {
        var subject = getProductName() + " - Quote";
        var body = buildEmailBody(selectedQuotes, plans);
        var prefix = "mailto:?subject=" + encodeURIComponent(subject) + "&body=";
        var note = "\n\n[Quote truncated for email - use \"Download Excel\" for the full breakdown.]";
        if (prefix.length + encodeURIComponent(body).length > MAX_MAILTO_LENGTH) {
            var budget = MAX_MAILTO_LENGTH - prefix.length - encodeURIComponent(note).length;
            var lo = 0, hi = body.length, fit = 0;
            while (lo <= hi) {
                var mid = (lo + hi) >> 1;
                if (encodeURIComponent(body.slice(0, mid)).length <= budget) { fit = mid; lo = mid + 1; }
                else hi = mid - 1;
            }
            body = body.slice(0, fit) + note;
        }
        var mailto = prefix + encodeURIComponent(body);
        // A content script runs in an isolated JS world, and Chrome is stricter about letting that
        // world drive top-level navigation to a non-http(s) scheme than it is for the page's own
        // script - window.location.href, window.open(), and a synthetic <a> click can all silently
        // no-op here even though the exact same call works fine from an ordinary page script. Asking
        // the background service worker to open it via chrome.tabs.create/update is the privileged,
        // reliable path extensions use for this.
        try {
            chrome.runtime.sendMessage({ type: "FRSH_OPEN_MAILTO", url: mailto }, function() {
                void chrome.runtime.lastError; // nothing more we can do if the background isn't reachable
            });
        } catch (e) {
            // Extension context gone (page navigated/reloaded mid-action) - fall back to the direct
            // approach, which at least works in some browsers even from a content script.
            window.location.href = mailto;
        }
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
            var row = computeRow(it, quote, plans);
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
        if (activeQuote().proration.enabled) renderProrationResult();
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
        // The delta appears whenever Compare Prices is on, exactly two quotes are picked, and this
        // quote is one of them - it's measured against whichever quote is the other half of the
        // pair, regardless of whether either is marked as the current subscription. If the other
        // one happens to be marked current, the label calls that out.
        var cmp = appState.compare;
        var inComparison = cmp.enabled && cmp.quoteIds.length === 2 && cmp.quoteIds.indexOf(quote.id) !== -1;
        var otherQuote = null;
        if (inComparison) {
            var otherId = cmp.quoteIds[0] === quote.id ? cmp.quoteIds[1] : cmp.quoteIds[0];
            otherQuote = appState.quotes.filter(function(q) { return q.id === otherId; })[0] || null;
        }
        if (otherQuote) {
            var baseline = totalsForQuote(otherQuote, plans);
            var delta = totals.totalArr - baseline.totalArr;
            var deltaPct = baseline.totalArr > 0 ? (delta / baseline.totalArr * 100) : (delta === 0 ? 0 : 100);
            var sign = delta >= 0 ? "+" : "−";
            var cls = delta >= 0 ? "up" : "down";
            var otherLabel = quoteDisplayName(otherQuote) + (otherQuote.isCurrent ? " - current subscription" : "");
            html += '<div class="frsh-summary-item"><div class="stat-label">ARR vs "' + escapeHtml(otherLabel) + '"</div><div class="stat-value ' + cls + '">' + sign + money(Math.abs(delta)) + ' <span class="stat-sub">(' + sign + fmt(Math.abs(deltaPct)) + "%)</span></div></div>";
        }
        els.summarySection.hidden = false;
        els.summarySection.innerHTML = html;
    }

    function renderTabs() {
        if (!els.quoteTabs) return;
        var html = appState.quotes.map(function(q, i) {
            var active = i === appState.activeIndex ? " active" : "";
            var currentCls = q.isCurrent ? " current" : "";
            var currentTitle = q.isCurrent ? "Current subscription (click to unmark)" : "Mark as the customer's current subscription";
            var star = '<span class="tab-current-toggle' + currentCls + '" data-index="' + i + '" title="' + currentTitle + '">' + (q.isCurrent ? "★" : "☆") + "</span>";
            var duplicate = '<span class="tab-duplicate" data-index="' + i + '" title="Duplicate this quote">⧉</span>';
            var remove = appState.quotes.length > 1 ? '<span class="tab-remove" data-index="' + i + '" aria-label="Remove quote" title="Remove this quote">✕</span>' : "";
            return '<button type="button" class="quote-tab' + active + '" data-index="' + i + '" title="Double-click to rename this quote">' + star + escapeHtml(quoteDisplayName(q)) + duplicate + remove + "</button>";
        }).join("");
        els.quoteTabs.innerHTML = '<div class="quote-tab-track">' + html + '</div><button type="button" id="newQuoteBtn" class="quote-tab-add" title="Start a new quote to compare against this one">+ New quote</button>';
    }

    // Lets the user pick exactly two quotes to compare (checkboxes disable once two are picked).
    // Marking a quote as the current subscription is a separate action (the ★ on its tab).
    function renderComparePanel() {
        if (!els.comparePanel) return;
        els.comparePanel.hidden = !appState.compare.enabled;
        if (!appState.compare.enabled) return;
        var ids = appState.compare.quoteIds;
        els.comparePickList.innerHTML = appState.quotes.map(function(q) {
            var picked = ids.indexOf(q.id) !== -1;
            var checkedAttr = picked ? " checked" : "";
            var disabledAttr = (!picked && ids.length >= 2) ? " disabled" : "";
            var label = escapeHtml(quoteDisplayName(q)) + (q.isCurrent ? " (current subscription)" : "");
            return '<div class="compare-row">' +
                '<label class="compare-check" title="Pick this quote to compare (max 2)"><input type="checkbox" class="compare-pick" value="' + q.id + '"' + checkedAttr + disabledAttr + ">" + label + "</label>" +
                "</div>";
        }).join("");
    }

    // Lets the user estimate a prorated value for the current quote (its Total Invoice Value)
    // between two dates - e.g. a mid-cycle upgrade, downgrade, or cancellation - using the fraction
    // of the quote's own billing cycle that falls between the change date and the end date. The
    // toggle and dates live on the quote itself, so each quote remembers its own independently as
    // you switch tabs, and the cycle always matches that quote's Billing Cycle setting.
    function renderProrationPanel() {
        if (!els.prorationPanel) return;
        var proration = activeQuote().proration;
        els.prorationPanel.hidden = !proration.enabled;
        if (!proration.enabled) return;
        var cycleLabel = BILLING_CYCLE_LABELS[activeQuote().billingCycle] || "Annual";
        els.prorationTitle.textContent = "Estimate a prorated value for this quote (billed " + cycleLabel + ") between two dates";
        els.prorationChangeDate.value = proration.changeDate;
        els.prorationEndDate.value = proration.endDate;
        renderProrationResult();
    }

    function renderProrationResult() {
        if (!els.prorationResult) return;
        var plans = getPlans();
        if (!plans || !activeQuote().items.length) {
            els.prorationResult.textContent = "Add a line item to this quote first.";
            return;
        }
        var proration = activeQuote().proration;
        if (!proration.changeDate || !proration.endDate) {
            els.prorationResult.textContent = "Enter both dates to estimate the prorated value.";
            return;
        }
        var changeMs = new Date(proration.changeDate + "T00:00:00").getTime();
        var endMs = new Date(proration.endDate + "T00:00:00").getTime();
        if (isNaN(changeMs) || isNaN(endMs)) {
            els.prorationResult.textContent = "Enter valid dates to estimate the prorated value.";
            return;
        }
        var totalInvoiceValue = totalsForQuote(activeQuote(), plans).totalInvoiceValue;
        var cycle = activeQuote().billingCycle || "annual";
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
        els.billingCycleSelect.value = quote.billingCycle;
        els.compareCheckbox.checked = appState.compare.enabled;
        renderComparePanel();
        els.prorationCheckbox.checked = quote.proration.enabled;
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
                rowsHtml.push(renderPlanRow(planItem, quote, plans, isReseller));
                quote.items.filter(function(it) { return it.kind === "addon" && it.parentItemId === planItem.id; }).forEach(function(addonItem) {
                    rowsHtml.push(renderAddonRow(addonItem, quote, plans, isReseller));
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

    function renderPlanRow(item, quote, plans, isReseller) {
        var row = computeRow(item, quote, plans);
        var planOptions = plans.map(function(p, idx) {
            return '<option value="' + idx + '"' + (idx === item.planIndex ? " selected" : "") + ">" + escapeHtml(p.planName) + "</option>";
        }).join("");
        return '<tr data-item-id="' + item.id + '">' +
            '<td><div class="item-name">' + escapeHtml(getProductName()) + " — " +
            '<select class="plan-select" title="Move this line item to a different plan, keeping its licenses and discount">' + planOptions + "</select>" +
            "</div></td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '" title="Number of licenses"></td>' +
            '<td class="num cell-unit">' + money(row.cadenceUnitPrice) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '" title="Discount percentage for this line"></td>' +
            '<td class="num cell-invoice">' + money(row.invoiceValue) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove" title="Remove this line item">✕</button></td>' +
            "</tr>";
    }

    function renderAddonRow(item, quote, plans, isReseller) {
        var row = computeRow(item, quote, plans);
        return '<tr data-item-id="' + item.id + '" class="addon-row">' +
            '<td><div class="item-name">' + escapeHtml(item.name) + "</div></td>" +
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
