(function () {
    "use strict";

    // Bumped alongside the extension version so a genuine update shows this again,
    // but reopening this page (e.g. from the GitHub link) after dismissing it doesn't.
    var WHATS_NEW_VERSION = "2.3.0";
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

    renderDots();
    if (!hasSeenThisVersion()) overlay.hidden = false;
})();
