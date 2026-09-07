(function () {
    "use strict";

    // Bumped alongside the extension version so a genuine update shows this again,
    // but reopening this page (e.g. from the GitHub link) after dismissing it doesn't.
    var WHATS_NEW_VERSION = "2.4.2";
    var STORAGE_KEY = "frshWhatsNewSeen";

    var overlay = document.getElementById("wnOverlay");
    var track = document.getElementById("wnTrack");
    var dotsEl = document.getElementById("wnDots");
    var slides = track.querySelectorAll(".wn-slide");
    var index = 0;

    function hasSeenThisVersion() {
        try { return localStorage.getItem(STORAGE_KEY) === WHATS_NEW_VERSION; }
        catch (e) { return false; }
    }

    function markSeen() {
        try { localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION); } catch (e) { /* private mode etc. */ }
    }

    function renderDots() {
        dotsEl.innerHTML = "";
        slides.forEach(function (_, i) {
            var dot = document.createElement("button");
            dot.type = "button";
            dot.className = "wn-dot" + (i === index ? " active" : "");
            dot.setAttribute("aria-label", "Go to slide " + (i + 1) + " of " + slides.length);
            dot.addEventListener("click", function () { goTo(i); });
            dotsEl.appendChild(dot);
        });
    }

    function goTo(i) {
        index = Math.max(0, Math.min(slides.length - 1, i));
        track.style.transform = "translateX(-" + (index * 100) + "%)";
        renderDots();
    }

    function closeModal() {
        overlay.hidden = true;
        markSeen();
    }

    document.getElementById("wnPrev").addEventListener("click", function () { goTo(index - 1); });
    document.getElementById("wnNext").addEventListener("click", function () { goTo(index + 1); });
    document.getElementById("wnCloseBtn").addEventListener("click", closeModal);
    document.getElementById("wnGotItBtn").addEventListener("click", closeModal);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !overlay.hidden) closeModal();
    });

    // The small "What's new" thumbnail strip further down the page reopens this same modal
    // scrolled to the clicked feature's slide, regardless of whether it's already been dismissed.
    document.querySelectorAll(".feature-card[data-slide]").forEach(function (card) {
        card.addEventListener("click", function () {
            overlay.hidden = false;
            goTo(Number(card.getAttribute("data-slide")));
        });
    });

    renderDots();
    if (!hasSeenThisVersion()) overlay.hidden = false;

    // Floating "Share on Slack" button opens a modal with the message in a text area,
    // so the user can copy it and pick their own channel/DM in Slack to paste it into.
    var shareBtn = document.getElementById("shareSlackBtn");
    var shareOverlay = document.getElementById("shareOverlay");
    var shareTextarea = document.getElementById("shareTextarea");
    var shareCopyBtn = document.getElementById("shareCopyBtn");
    var shareOpenBtn = document.getElementById("shareOpenBtn");
    var shareCloseBtn = document.getElementById("shareCloseBtn");
    var SHARE_MESSAGE = "Check out FRSH PriceView, a Chrome extension for building and comparing Freshworks pricing quotes — install it from the Chrome Web Store: https://chromewebstore.google.com/detail/frsh-priceview/bbmimfdmijoaefhmobocdllhhdpjnkoc";
    var copyResetTimer = null;

    function openShareModal() {
        shareTextarea.value = SHARE_MESSAGE;
        shareOverlay.hidden = false;
        shareTextarea.focus();
        shareTextarea.select();
    }

    function closeShareModal() {
        shareOverlay.hidden = true;
    }

    if (shareBtn) shareBtn.addEventListener("click", openShareModal);

    if (shareCopyBtn) {
        shareCopyBtn.addEventListener("click", function () {
            function onCopied(ok) {
                shareCopyBtn.textContent = ok ? "Copied!" : "Couldn't copy — select & copy manually";
                if (copyResetTimer) clearTimeout(copyResetTimer);
                copyResetTimer = setTimeout(function () { shareCopyBtn.textContent = "Copy to clipboard"; }, 2000);
            }
            shareTextarea.select();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(SHARE_MESSAGE).then(function () { onCopied(true); }, function () { onCopied(false); });
            } else {
                onCopied(document.execCommand("copy"));
            }
        });
    }

    if (shareOpenBtn) {
        shareOpenBtn.addEventListener("click", function () {
            window.open("https://app.slack.com/client", "_blank", "noopener");
        });
    }

    if (shareCloseBtn) shareCloseBtn.addEventListener("click", closeShareModal);
    if (shareOverlay) {
        shareOverlay.addEventListener("mousedown", function (e) { if (e.target === shareOverlay) closeShareModal(); });
    }
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && shareOverlay && !shareOverlay.hidden) closeShareModal();
    });
})();
