chrome.runtime.onUpdateAvailable.addListener(function(details) {
    chrome.runtime.reload(); // To restart the chrome App instantaneously
});

chrome.runtime.onInstalled.addListener((details) => {
    chrome.action.setBadgeText({
        text: "DEFAULT",
    });
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        // Code to be executed on first install
        // eg. open a tab with a url
        chrome.tabs.create({
            url: "./installed.html"
        });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        // When extension is updated
        chrome.tabs.create({
            url: "./installed.html"
        });
    } else if (details.reason === chrome.runtime.OnInstalledReason.CHROME_UPDATE) {
        // When browser is updated
    } else if (details.reason === chrome.runtime.OnInstalledReason.SHARED_MODULE_UPDATE) {
        // When a shared module is updated
    }
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
var priceCount = 0;
var dropDowns = [];
var tabPanels = [];
var dropDown = [];

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url.startsWith(extensions)) {
        const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
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
                args: [currency[priceCount - 1].code],
            })
            .then(() => console.log("injected the currency function"));

        if (priceCount == 5) priceCount = 0;
    }

});

function initialiseDropDown(curr) {

    dropDowns = document.getElementsByClassName('pricing-options-dropdown');
    tabPanels = document.querySelectorAll('[data-tabcontent]');
    dropDown = [];
    for (var i = 0; i < tabPanels.length; i++) {

        tabPanels[i].setAttribute('data-frsh-panel-id', i);
        if (i == 0) {
            tabPanels[i].style.display = "block";
        } else {
            tabPanels[i].style.display = "none";
        }

    }

    for (var i = 0; i < dropDowns.length; i++) {
        dropDowns[i].setAttribute('data-frsh-id', i);
        dropDowns[i].onchange = function() {
            var bodyEl = document.getElementsByTagName("BODY")[0];
            var curr = bodyEl.getAttribute("data-frsh-page-currency");
            //console.log(this.getAttribute('data-frsh-id'));
            changedDropdown = this.getAttribute('data-frsh-id');
            dropDowns = document.getElementsByClassName('pricing-options-dropdown');
            var pricingOption = document.getElementsByClassName("pricing-option");
            var ddArray = [];
            if (dropDowns.length > 0) {
                for (var i = 0; i < dropDowns.length; i++) {
                    var temp = [];
                    for (var j = 0; j < pricingOption.length; j++) {
                        if (pricingOption[j].dataset.pricingOptions == dropDowns[changedDropdown].value) {
                            temp.push(pricingOption[j]);
                        }
                    }
                    ddArray.push(temp);
                }
            }
            if (ddArray.length > 0) {
                for (var i = 0; i < ddArray.length; i++) {
                    for (var j = 0; j < ddArray[i].length; j++) {
                        if (ddArray[i][j].dataset.pricingCurrency == curr) {
                            ddArray[i][j].attributes[3].nodeValue = "display:block";
                        } else {
                            ddArray[i][j].attributes[3].nodeValue = "display:none";
                        }
                    }
                }
            }
        }

        var item = {};
        item["value"] = dropDowns[i].value;
        item["viewStatus"] = false;
        item["dropDownID"] = i;
        item["parentPanelID"] = dropDowns[i].parentNode.parentNode.parentNode.parentNode.parentNode.getAttribute('data-frsh-panel-id');
        dropDown.push(item);
    }
}


function setCurrency(curr) {
    var pricTablePlan = document.getElementsByClassName("pricing-table-plan-info");
    var addonsPrice = document.getElementsByClassName("add-ons-plan-info");
    dropDowns = document.getElementsByClassName('pricing-options-dropdown');
    var pricingOption = document.getElementsByClassName("pricing-option");
    var bodyEl = document.getElementsByTagName("BODY")[0];
    bodyEl.setAttribute("data-frsh-page-currency", curr);
    var planHeader = document.getElementsByClassName("plan-header");

    //pricing table

    for (var i = 0; i < pricTablePlan.length; i++) {
        if (pricTablePlan[i].dataset.currency == curr) {
            if (pricTablePlan[i].classList.contains('hide')) {
                pricTablePlan[i].classList.remove('hide');
            }
        } else {
            pricTablePlan[i].classList.add('hide');
        }
    }

    //addons

    for (var i = 0; i < addonsPrice.length; i++) {
        if (addonsPrice[i].dataset.currency == curr) {
            if (addonsPrice[i].classList.contains('hide')) {
                addonsPrice[i].classList.remove('hide');
            }
        } else {
            addonsPrice[i].classList.add('hide');
        }
    }

    //variable dropdown

    var ddArray = [];
    if (dropDowns.length > 0) {
        for (var i = 0; i < dropDowns.length; i++) {
            var temp = [];
            for (var j = 0; j < pricingOption.length; j++) {
                if (pricingOption[j].dataset.pricingOptions == dropDowns[i].value) {
                    temp.push(pricingOption[j]);
                }
            }
            ddArray.push(temp);
        }
    }

    if (ddArray.length > 0) {
        for (var i = 0; i < ddArray.length; i++) {
            for (var j = 0; j < ddArray[i].length; j++) {
                if (ddArray[i][j].dataset.pricingCurrency == curr) {
                    ddArray[i][j].attributes[3].nodeValue = "display:block";
                } else {
                    ddArray[i][j].attributes[3].nodeValue = "display:none";
                }
            }
        }
    }

    //detailed comparison

    for (var i = 0; i < planHeader.length; i++) {
        var children = planHeader[i].children;
        for (var j = 0; j < children.length; j++) {
            if (children[j].dataset.currency == curr) {
                if(children[j].attributes.style){
                    children[j].attributes.style.value = "display:block";
                }
            } else {
                if(children[j].attributes.style){
                    children[j].attributes.style.value = "display:none";
                }
            }
        }
    }
}

chrome.tabs.onUpdated.addListener(
    function(tab_id, changeInfo, tab) {

        if (tab.url.startsWith(extensions)) {
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