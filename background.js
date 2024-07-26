chrome.runtime.onUpdateAvailable.addListener(function(details) {
    chrome.runtime.reload(); // To restart the chrome App instantaneously
});

chrome.runtime.onInstalled.addListener((details) => {
    chrome.action.setBadgeText({
        text: "FRSH",
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
    chrome.contextMenus.create({
        title: "Calculate Discounts",
        contexts: ["selection"],
        id: "calculateDiscount"
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
var priceCount = 0;

//Context Menu Feature
/*
chrome.contextMenus.onClicked.addListener((item, tab) => {
    const menuItemId = item.menuItemId;
    const selectionText = item.selectionText;

    chrome.scripting
        .executeScript({
            target: { tabId: tab.id },
            func: calculateDiscountFunction,
            args: [selectionText]
        })
        .then(() => console.log("injected the calculateDiscount function"));
});*/

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
                args: [currency[priceCount - 1].code, nextState],
            })
            .then(() => console.log("injected the currency function"));

        if (priceCount == 5) priceCount = 0;
    }

});

function calculateDiscountFunction(selectionText) {
    var styles = `
    #discountPopUp {
      position: fixed;
      top:200;
      left:200;
      display: block;
      padding: 10px;
      background-color: #fff;
      border: 1px solid #ccc;
      box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
      font-size: 14px;
      z-index: 10; /* Make sure the window is above other elements */
      width: 200px; /* Set a fixed width for the window */
    }
    
    #close-button {
      position: absolute;
      top: 5px;
      right: 5px;
      cursor: pointer; /* Change cursor to indicate clickability */
      width: 20px;
      height: 20px;
      text-align: center;
      line-height: 20px; /* Center text vertically */
      background-color: #ccc;
      border: none;
      border-radius: 50%; /* Create a circular button */
    }
`
    var styleSheet = document.createElement("style")
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)

    //console.log(selectionText);

    var discountPop = '<div id="discountPopUp">' + selectionText + '<button id="close-button">X</button></div>';
    var bdy = document.getElementById("main-content");
    bdy.innerHTML += discountPop;

    const windowElement = document.getElementById('floating-window');
    const closeButton = document.getElementById('close-button');

    closeButton.addEventListener('click', () => {
        // Hide the window on button click
        windowElement.style.display = 'none';
    });
}

function getOffset(el) {
    const rect = el.getBoundingClientRect();
    return {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY
    };
}

function setCurrency(curr, nextState) {

    var addData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
    //console.log(addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection);
    var currentPricingData = addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection;
    var numberOfAddons = addData.props.pageProps.pageProps.componentsCollection.items.length;
    //console.log(numberOfAddons);
    //console.log(currentPricingData);

    //Pulling the addon prices
    const addonPrices = [];
    for (var i = 0; i < numberOfAddons; i++) {
        if (addData.props.pageProps.pageProps.componentsCollection.items[i].__typename == "ComponentStaticModalPopup") {
            var obj = {
                title: addData.props.pageProps.pageProps.componentsCollection.items[i].heading,
                price: addData.props.pageProps.pageProps.componentsCollection.items[i].pricingCollection
            };
            addonPrices.push(obj);
        }
    }
    //console.log(addonPrices);
    //console.log(addData.props.pageProps.pageProps.componentsCollection.items);

    var pricTablePlan = document.getElementsByClassName("sc-ace17a57-0 bDJUlF")[0].childNodes[5].childNodes;
    //console.log(pricTablePlan);


    //identifying the billing cycle
    var annualTerm = true;
    var pricingTermDiv = document.querySelector('[aria-label="Pricing Term"]').childNodes;
    //console.log(pricingTermDiv);
    if (pricingTermDiv[0].ariaPressed == "true" && pricingTermDiv[1].ariaPressed == "false") {
        annualTerm = false;
    }
    //console.log("annualTerm:"+annualTerm);

    //Update the currency and price on the main Table

    if (pricTablePlan[0].tagName == "THEAD") {
        var newPriceTablePlanHeader = pricTablePlan[0].children[0].children;
        for (var i = 0; i < newPriceTablePlanHeader.length; i++) {
            //console.log(newPriceTablePlanHeader[i].childNodes);
            if (nextState == "USD") {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsdAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsd;
                }
            } else if (nextState == "EUR") {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€" + currentPricingData.items[i].priceEurAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€" + currentPricingData.items[i].priceEur;
                }
            } else if (nextState == "GBP") {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£" + currentPricingData.items[i].priceGbpAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£" + currentPricingData.items[i].priceGbp;
                }
            } else if (nextState == "INR") {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹" + currentPricingData.items[i].priceInrAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹" + currentPricingData.items[i].priceInr;
                }
            } else if (nextState == "AUD") {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD" + currentPricingData.items[i].priceAudAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD" + currentPricingData.items[i].priceAud;
                }
            } else {
                if (annualTerm) {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsdAnnual;
                } else {
                    newPriceTablePlanHeader[i+1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsd;
                }
            }
        }
    } else {
        for (var i = 0; i < pricTablePlan.length; i++) {
            if (pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML != "Free") {
                if (nextState == "USD") {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsdAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsd;
                    }
                } else if (nextState == "EUR") {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceEurAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceEur;
                    }
                } else if (nextState == "GBP") {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceGbpAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceGbp;
                    }
                } else if (nextState == "INR") {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceInrAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceInr;
                    }
                } else if (nextState == "AUD") {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceAudAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceAud;
                    }
                } else {
                    if (annualTerm) {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsdAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsd;
                    }
                }
            }
        }
    }


    //Updating the popups
    var addonPopup = document.querySelectorAll(".sc-ace17a57-0.kChrSf");
    var dynamicAddonList = ["Day Passes", "Freshcaller", "Freshsales", "Campaign Contacts", "Marketing Contacts", "Conversion Rate Optimization"];
    var ignoreAddonList = ["Freddy Insights", "Advanced Discovery and Dependency Mapping"];

    if (pricTablePlan[0].tagName == "THEAD") {

    } else {
        for (var i = 0; i < addonPopup.length; i++) {
            var popupName = addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML;
            //console.log("Popup Name "+popupName);
            //differentiate between a static popup and a dynamic popup
            if (checkIfExistsInArray(popupName, dynamicAddonList) || checkIfExistsInArray(popupName, ignoreAddonList)) {
                if (!checkIfExistsInArray(popupName, ignoreAddonList)) {
                    var visOption = addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[1].childNodes[0].value;
                    for (var j = 0; j < addonPrices[i].price.items.length; j++) {
                        if (visOption == addonPrices[i].price.items[j].planName) {
                            if (nextState == "USD") {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[j].priceUsdAnnual;
                            } else if (nextState == "EUR") {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "€" + addonPrices[i].price.items[j].priceEurAnnual;
                            } else if (nextState == "GBP") {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "£" + addonPrices[i].price.items[j].priceGbpAnnual;
                            } else if (nextState == "INR") {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "₹" + addonPrices[i].price.items[j].priceInrAnnual;
                            } else if (nextState == "AUD") {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "AUD" + addonPrices[i].price.items[j].priceAudAnnual;
                            } else {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[j].priceUsdAnnual;
                            }
                        }
                    }
                }
            } else if (popupName == "Assets Pack") { //Assets Pack functionality is different
                //console.log('here);')
                var visOption = addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].childNodes[0].value;
                //console.log("visOption"+visOption);
                for (var j = 0; j < addonPrices[i].price.items.length; j++) {
                    if (visOption == addonPrices[i].price.items[j].planName) {
                        if (nextState == "USD") {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[j].priceUsdAnnual;
                        } else if (nextState == "EUR") {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "€" + addonPrices[i].price.items[j].priceEurAnnual;
                        } else if (nextState == "GBP") {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "£" + addonPrices[i].price.items[j].priceGbpAnnual;
                        } else if (nextState == "INR") {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "₹" + addonPrices[i].price.items[j].priceInrAnnual;
                        } else if (nextState == "AUD") {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "AUD" + addonPrices[i].price.items[j].priceAudAnnual;
                        } else {
                            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[j].priceUsdAnnual;
                        }
                    }
                }
            } else {
                if (nextState == "USD") {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[0].priceUsdAnnual;
                } else if (nextState == "EUR") {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "€" + addonPrices[i].price.items[0].priceEurAnnual;
                } else if (nextState == "GBP") {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "£" + addonPrices[i].price.items[0].priceGbpAnnual;
                } else if (nextState == "INR") {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "₹" + addonPrices[i].price.items[0].priceInrAnnual;
                } else if (nextState == "AUD") {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "AUD" + addonPrices[i].price.items[0].priceAudAnnual;
                } else {
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[0].priceUsdAnnual;
                }
            }
        }
    }

    function checkIfExistsInArray(text, array) {
        for (var i = 0; i < array.length; i++) {
            if (text == array[i]) {
                return true;
            }
        }
        return false;
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