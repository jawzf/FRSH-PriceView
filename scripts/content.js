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
    function planAddons(plan) {
        var results = [];
        plan.planFeaturesGroupCollection.items.forEach(function(g) {
            if (!g.productFeature || !g.includedInPlan || !g.description) return;
            if (!g.description.links || !g.description.links.entries || !g.description.links.entries.inline || !g.description.links.entries.inline.length) return;
            var lp = firstEmbeddedLocalePrices(g.description);
            if (lp) results.push({ name: g.productFeature.name, localePrices: lp });
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
    // Quote state
    // ---------------------------------------------------------------------
    var quoteState = {
        customerType: "direct", // "direct" | "reseller"
        currency: "USD",
        items: []
    };
    var nextItemId = 1;

    function addPlanItem(planIndex, plans) {
        var plan = plans[planIndex];
        if (!plan) return null;
        var item = {
            id: nextItemId++,
            kind: "plan",
            planIndex: planIndex,
            planName: plan.planName,
            billedAnnually: getAnnualTermFromPage(),
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        quoteState.items.push(item);
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
            qty: 1,
            discountPct: 0,
            marginPct: 20
        };
        quoteState.items.push(item);
        return item;
    }

    function removeItem(id) {
        quoteState.items = quoteState.items.filter(function(it) {
            return it.id !== id && it.parentItemId !== id; // removing a plan also removes its addons
        });
    }

    function unitPricesFor(item, plans) {
        if (item.kind === "plan") {
            var plan = plans[item.planIndex];
            var info = currencyInfo(quoteState.currency);
            return {
                monthly: toNumber(plan["price" + info.field]),
                annual: toNumber(plan["price" + info.field + "Annual"])
            };
        }
        return {
            monthly: addonPriceFor(item.localePrices, quoteState.currency, false),
            annual: addonPriceFor(item.localePrices, quoteState.currency, true)
        };
    }

    function computeRow(item, plans) {
        var unit = unitPricesFor(item, plans);
        var qty = Math.max(0, toNumber(item.qty));
        var discount = Math.min(100, Math.max(0, toNumber(item.discountPct)));
        var monthlyTotal = unit.monthly * qty * (1 - discount / 100);
        var annualTotal = unit.annual * qty * 12 * (1 - discount / 100);
        var margin = Math.min(100, Math.max(0, toNumber(item.marginPct)));
        var partnerCost = annualTotal * (1 - margin / 100);
        return { unit: unit, monthlyTotal: monthlyTotal, annualTotal: annualTotal, partnerCost: partnerCost };
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
        return currencyInfo(quoteState.currency).symbol + fmt(n);
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
        els.customerType = shadowRoot.getElementById("customerType");
        els.currencySelect = shadowRoot.getElementById("currencySelect");
        els.tbody = shadowRoot.getElementById("tbody");
        els.theadReseller = shadowRoot.getElementById("theadReseller");
        els.addPlanSelect = shadowRoot.getElementById("addPlanSelect");
        els.addPlanBtn = shadowRoot.getElementById("addPlanBtn");
        els.totalsRow = shadowRoot.getElementById("totalsRow");
        els.closeBtn = shadowRoot.getElementById("closeBtn");
        wireStaticEvents();
    }

    var MODAL_HTML = [
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
        '    background: #ffffff; width: min(980px, 100%); border-radius: 20px;',
        '    box-shadow: 0 24px 64px -12px rgba(0,0,0,0.4); padding: 28px 28px 24px;',
        '  }',
        '  .frsh-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }',
        '  .frsh-head h1 { font-size: 19px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }',
        '  .frsh-head .sub { color: #63625a; font-size: 13px; margin-top: 2px; }',
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
        '  tfoot td { border-top: 2px solid #101114; border-bottom: none; font-weight: 700; padding-top: 12px; }',
        '  .frsh-empty { padding: 32px 8px; text-align: center; color: #63625a; }',
        '  .frsh-footer-note { margin-top: 16px; font-size: 11.5px; color: #63625a; }',
        '</style>',
        '<div id="overlay">',
        '  <div id="panel" role="dialog" aria-label="Generate Quote">',
        '    <div class="frsh-head">',
        '      <div>',
        '        <h1>Generate Quote</h1>',
        '        <div class="sub" id="productName"></div>',
        '      </div>',
        '      <button class="frsh-close" id="closeBtn" aria-label="Close">✕</button>',
        '    </div>',
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
        '    </div>',
        '    <table>',
        '      <thead>',
        '        <tr>',
        '          <th>Item</th>',
        '          <th class="num">Qty</th>',
        '          <th class="num">Unit / mo</th>',
        '          <th class="num">Discount %</th>',
        '          <th class="num">Monthly cost</th>',
        '          <th class="num">Annual cost</th>',
        '          <th class="num" id="theadReseller" hidden>Margin %</th>',
        '          <th class="num" id="theadResellerCost" hidden>Partner cost</th>',
        '          <th></th>',
        '        </tr>',
        '      </thead>',
        '      <tbody id="tbody"></tbody>',
        '      <tfoot>',
        '        <tr id="totalsRow"></tr>',
        '      </tfoot>',
        '    </table>',
        '    <div class="frsh-add-plan">',
        '      <select id="addPlanSelect"></select>',
        '      <button type="button" id="addPlanBtn">+ Add plan</button>',
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
            quoteState.customerType = btn.getAttribute("data-value");
            render();
        });

        els.currencySelect.addEventListener("change", function() {
            quoteState.currency = els.currencySelect.value;
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

        // Event delegation for the dynamically-rendered table body. Updates just this row's
        // computed cells (and the totals footer) in place, so the input the user is typing in
        // never loses focus the way a full render() would cause.
        els.tbody.addEventListener("input", function(e) {
            var row = e.target.closest("tr[data-item-id]");
            if (!row) return;
            var id = Number(row.getAttribute("data-item-id"));
            var item = quoteState.items.filter(function(it) { return it.id === id; })[0];
            if (!item) return;
            if (e.target.matches(".qty-input")) item.qty = e.target.value;
            else if (e.target.matches(".discount-input")) item.discountPct = e.target.value;
            else if (e.target.matches(".margin-input")) item.marginPct = e.target.value;
            var plans = getPlans();
            if (!plans) return;
            var computed = computeRow(item, plans);
            var monthlyCell = row.querySelector(".cell-monthly");
            var annualCell = row.querySelector(".cell-annual");
            var partnerCell = row.querySelector(".cell-partner");
            if (monthlyCell) monthlyCell.textContent = money(computed.monthlyTotal);
            if (annualCell) annualCell.textContent = money(computed.annualTotal);
            if (partnerCell) partnerCell.textContent = money(computed.partnerCost);
            renderTotalsOnly();
        });

        els.tbody.addEventListener("click", function(e) {
            var removeBtn = e.target.closest(".row-remove");
            if (removeBtn) {
                var row = removeBtn.closest("tr[data-item-id]");
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
                var planItem = quoteState.items.filter(function(it) { return it.id === planItemId; })[0];
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

    function openModal(planIndex) {
        ensureModal();
        var plans = getPlans();
        if (plans && planIndex != null && planIndex >= 0) {
            addPlanItem(planIndex, plans);
        }
        els.overlay.style.display = "flex";
        els.currencySelect.value = quoteState.currency;
        render();
    }

    function renderTotalsOnly() {
        var plans = getPlans();
        if (!plans) return;
        var totalMonthly = 0, totalAnnual = 0, totalPartner = 0;
        quoteState.items.forEach(function(it) {
            var row = computeRow(it, plans);
            totalMonthly += row.monthlyTotal;
            totalAnnual += row.annualTotal;
            totalPartner += row.partnerCost;
        });
        var isReseller = quoteState.customerType === "reseller";
        var cells = [
            '<td colspan="4">Total</td>',
            '<td class="num">' + money(totalMonthly) + "</td>",
            '<td class="num">' + money(totalAnnual) + "</td>"
        ];
        if (isReseller) {
            cells.push('<td class="num"></td>');
            cells.push('<td class="num">' + money(totalPartner) + "</td>");
        }
        cells.push("<td></td>");
        els.totalsRow.innerHTML = cells.join("");
    }

    function render() {
        if (!shadowRoot) return;
        var plans = getPlans();
        els.productName.textContent = getProductName();

        [].forEach.call(els.customerType.querySelectorAll("button"), function(b) {
            b.classList.toggle("active", b.getAttribute("data-value") === quoteState.customerType);
        });
        var isReseller = quoteState.customerType === "reseller";
        var theadResellerCost = shadowRoot.getElementById("theadResellerCost");
        els.theadReseller.hidden = !isReseller;
        theadResellerCost.hidden = !isReseller;

        if (!plans) {
            els.tbody.innerHTML = '<tr><td colspan="9" class="frsh-empty">Could not read pricing data on this page.</td></tr>';
            els.totalsRow.innerHTML = "";
            return;
        }

        // "+ Add plan" dropdown: only plans with a real numeric price.
        var addable = plans.filter(function(p) { return !p.hidePrices; });
        els.addPlanSelect.innerHTML = addable.map(function(p) {
            var idx = plans.indexOf(p);
            return '<option value="' + idx + '">' + escapeHtml(p.planName) + "</option>";
        }).join("");

        if (!quoteState.items.length) {
            els.tbody.innerHTML = '<tr><td colspan="9" class="frsh-empty">No line items yet. Pick a plan below to start the quote.</td></tr>';
        } else {
            var rowsHtml = [];
            quoteState.items.filter(function(it) { return it.kind === "plan"; }).forEach(function(planItem) {
                rowsHtml.push(renderPlanRow(planItem, plans, isReseller));
                quoteState.items.filter(function(it) { return it.kind === "addon" && it.parentItemId === planItem.id; }).forEach(function(addonItem) {
                    rowsHtml.push(renderAddonRow(addonItem, plans, isReseller));
                });
                rowsHtml.push(renderAddAddonRow(planItem, plans, isReseller));
            });
            els.tbody.innerHTML = rowsHtml.join("");
        }

        renderTotalsOnly();
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

    function renderPlanRow(item, plans, isReseller) {
        var plan = plans[item.planIndex];
        var row = computeRow(item, plans);
        var cycleLabel = item.billedAnnually ? "Billed annually" : "Billed monthly";
        var unitDisplay = item.billedAnnually ? row.unit.annual : row.unit.monthly;
        return '<tr data-item-id="' + item.id + '">' +
            '<td><div class="item-name">' + escapeHtml(getProductName()) + " — " + escapeHtml(plan.planName) + "</div>" +
            '<span class="item-badge">' + cycleLabel + "</span></td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '"></td>' +
            '<td class="num">' + money(unitDisplay) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '"></td>' +
            '<td class="num cell-monthly">' + money(row.monthlyTotal) + "</td>" +
            '<td class="num cell-annual">' + money(row.annualTotal) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove">✕</button></td>' +
            "</tr>";
    }

    function renderAddonRow(item, plans, isReseller) {
        var row = computeRow(item, plans);
        var unitDisplay = item.billedAnnually ? row.unit.annual : row.unit.monthly;
        return '<tr data-item-id="' + item.id + '" class="addon-row">' +
            '<td><div class="item-name">' + escapeHtml(item.name) + "</div></td>" +
            '<td class="num"><input type="number" class="qty-input" min="0" step="1" value="' + item.qty + '"></td>' +
            '<td class="num">' + money(unitDisplay) + "</td>" +
            '<td class="num"><input type="number" class="discount-input" min="0" max="100" step="1" value="' + item.discountPct + '"></td>' +
            '<td class="num cell-monthly">' + money(row.monthlyTotal) + "</td>" +
            '<td class="num cell-annual">' + money(row.annualTotal) + "</td>" +
            resellerCells(row, isReseller, item) +
            '<td><button type="button" class="row-remove" aria-label="Remove">✕</button></td>' +
            "</tr>";
    }

    function renderAddAddonRow(planItem, plans, isReseller) {
        var plan = plans[planItem.planIndex];
        var alreadyAdded = quoteState.items.filter(function(it) { return it.kind === "addon" && it.parentItemId === planItem.id; }).map(function(it) { return it.name; });
        var available = planAddons(plan).filter(function(a) { return alreadyAdded.indexOf(a.name) === -1; });
        var colCount = isReseller ? 9 : 7;
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
