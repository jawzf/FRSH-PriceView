chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "DEFAULT",
    });
});
const extensions = "https://www.freshworks.com/";
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
var p = 0;
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url.startsWith(extensions)) {
        const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
        const nextState = currency[p++].label;

        // Set the action badge to the next state
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: nextState,
        });
        chrome.scripting
            .executeScript({
                target: { tabId: tab.id },
                func: setCurrency,
                args:[currency[p - 1].code],
            })
            .then(() => console.log("injected a function"));
        if (p == 5) p = 0;
    }
});

function setCurrency(curr) {
    var pricTablePlan = document.getElementsByClassName("pricing-table-plan-info");
    var addonsPrice = document.getElementsByClassName("add-ons-plan-info");
    //alert(JSON.stringify(curr));
    //console.log(pricTablePlan);
    //console.log(addonsPrice);

    for (var i = 0; i < pricTablePlan.length; i++) {
        if (pricTablePlan[i].dataset.currency == curr) {
            if (pricTablePlan[i].classList.contains('hide')) {
                pricTablePlan[i].classList.remove('hide');
            }
        } else {
            pricTablePlan[i].classList.add('hide');
        }
    }
    for (var i = 0; i < addonsPrice.length; i++) {
        if (addonsPrice[i].dataset.currency == curr) {
            if (addonsPrice[i].classList.contains('hide')) {
                addonsPrice[i].classList.remove('hide');
            }
        } else {
            addonsPrice[i].classList.add('hide');
        }
    }

}