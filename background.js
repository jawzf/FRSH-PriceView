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

function initialiseDropDown() {
    //donothing
}

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

    //Identify Product being displayed
    var productName = document.getElementsByClassName("sc-e5af17da-0 jhFKWQ")[0].innerHTML;
    console.log("Product:" + productName);
    var addData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
    //console.log(addData);
    //console.log(addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection);
    var currentPricingData = addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection;
    const addonPrices = [];
    if (productName == "Freshservice") {
        var addonPlanCount = addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection.items.length;
        var addonInfo = addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection.items;
        //console.log(addonPlanCount);
        //console.log(addonInfo);
        //console.log(currentPricingData);

        //Pulling the addon prices
        for (var i = 0; i < addonPlanCount; i++) {
            var featureCount = addonInfo[i].planFeaturesGroupCollection.items.length;
            //console.log(featureCount);
            var featureList = addonInfo[i].planFeaturesGroupCollection.items;
            //console.log(featureList);
            for (var j = 0; j < featureCount; j++) {
                if (featureList[j].includedInPlan && freshserviceAddonCheck(featureList[j].productFeature.name)) {
                    //console.log(featureList[j].description.links.entries.inline);
                    var obj = {
                        planIndex: i,
                        title: featureList[j].productFeature.name,
                        price: featureList[j].description.links.entries.inline[0].localePrices
                    };
                    addonPrices.push(obj);
                }
            }
        }
        //console.log(addonPrices);
        //console.log(addData.props.pageProps.pageProps.componentsCollection.items);
    } else {
        var numberOfAddons = addData.props.pageProps.pageProps.componentsCollection.items.length;
        //console.log(numberOfAddons);
        //console.log(currentPricingData);

        //Pulling the addon prices
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
        console.log(addData.props.pageProps.pageProps.componentsCollection.items);
    }
    console.log(addonPrices);
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
            //console.log(currentPricingData.items[i].internalName);
            if (currentPricingData.items[i].internalName == "fs-pricing-enterprise-plan") {
                continue;
            }
            if (newPriceTablePlanHeader[i + 1]) {
                if (nextState == "USD") {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsdAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsd;
                    }
                } else if (nextState == "EUR") {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€" + currentPricingData.items[i].priceEurAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€" + currentPricingData.items[i].priceEur;
                    }
                } else if (nextState == "GBP") {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£" + currentPricingData.items[i].priceGbpAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£" + currentPricingData.items[i].priceGbp;
                    }
                } else if (nextState == "INR") {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹" + currentPricingData.items[i].priceInrAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹" + currentPricingData.items[i].priceInr;
                    }
                } else if (nextState == "AUD") {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "A$" + currentPricingData.items[i].priceAudAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "A$" + currentPricingData.items[i].priceAud;
                    }
                } else {
                    if (annualTerm) {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsdAnnual;
                    } else {
                        newPriceTablePlanHeader[i + 1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$" + currentPricingData.items[i].priceUsd;
                    }
                }
            }
        }
    } else {
        for (var i = 0; i < pricTablePlan.length; i++) {
            if (pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML != "Free") {
                if (currentPricingData.items[i].internalName == "fs-pricing-enterprise-plan") {
                    continue;
                }
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
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "A$"
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceAudAnnual;
                    } else {
                        pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "A$"
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
    var ignoreAddonList = ["Freddy AI Insights", "Advanced Discovery and Dependency Mapping", "Sandbox Add-on"];
    var numberOfPlans = 3;
    if (productName == "Freshdesk" || productName == "Freshchat" || productName == "Freshservice") {
        numberOfPlans = 4;
    }

    if (pricTablePlan[0].tagName == "THEAD") {
        var newAddonRow = document.getElementsByClassName("rfWFf");
        for (var i = 0; i < newAddonRow.length; i++) {
            var addonName = newAddonRow[i].childNodes[0].innerText;
            if (addonName == "Campaign Contacts") {
                var tagLocal = newAddonRow[i].childNodes[numberOfPlans - 1].childNodes[0].localName;
            } else {
                var tagLocal = newAddonRow[i].childNodes[numberOfPlans].childNodes[0].localName;
            }
            if (addonName != "Collaborators" && addonName != "Freddy AI Insights (Beta)" && addonName != "Freddy AI Insights") {
                if (tagLocal == "div") {
                    var rowPrice = searchAddonPrice(addonName, addonPrices);
                    if (addonName == "Freddy AI Agent") {
                        rowPrice = searchAddonPrice("AI agent by Freddy AI Agent", addonPrices);
                    }
                    for (var j = 0; j < numberOfPlans; j++) {
                        if (newAddonRow[i].childNodes[j + 1].innerText != "") {
                            if (productName == "Freshservice") {

                            } else {
                                console.log(addonName + ":" + rowPrice);
                                var target = newAddonRow[i].childNodes[j + 1].childNodes[0].childNodes[0].childNodes[0];
                                if (nextState == "USD") {
                                    target.innerText = "$" + returnValidAddonPrice(j, rowPrice).priceUsdAnnual;
                                } else if (nextState == "EUR") {
                                    target.innerText = "€" + returnValidAddonPrice(j, rowPrice).priceEurAnnual;
                                } else if (nextState == "GBP") {
                                    //Fix to correct the bug on Freshdesk page which uses the wrong JSON key
                                    if (productName == "Freshdesk" && addonName == "Connector App Tasks") {
                                        target.innerText = "£" + returnValidAddonPrice(j, rowPrice).priceZarAnnual;
                                    } else {
                                        target.innerText = "£" + returnValidAddonPrice(j, rowPrice).priceGbpAnnual;
                                    }
                                } else if (nextState == "INR") {
                                    target.innerText = "₹" + returnValidAddonPrice(j, rowPrice).priceInrAnnual;
                                } else if (nextState == "AUD") {
                                    target.innerText = "A$" + returnValidAddonPrice(j, rowPrice).priceAudAnnual;
                                } else {
                                    target.innerText = "$" + returnValidAddonPrice(j, rowPrice).priceUsdAnnual;
                                }

                                //Add website custom text below
                                if (addonName == "Freshcaller" || addonName == "Freshsales") {
                                    target.innerText = "Starting from " + target.innerText;
                                } else if (addonName == "Freddy AI Agent") {
                                    target.innerText = "First 500 sessions included. " + target.innerText + " for 1000 sessions."
                                } else if (addonName == "Connector App Tasks") {
                                    target.innerText = target.innerText + " per 5,000 tasks"
                                } else if (addonName == "Campaign Contacts") {
                                    target.innerText = target.innerText + " 5,000 contacts"
                                } else if (addonName == "Freddy AI Copilot" && productName == "Freshdesk" && j == 2) {
                                    target.innerText = "Included"
                                } else {

                                }
                            }
                        }

                    }

                }
            }

        }

    } else {
        for (var i = 0; i < addonPopup.length; i++) {
            var popupName = addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML;
            //console.log("Popup Name " + popupName);
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
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "A$" + addonPrices[i].price.items[j].priceAudAnnual;
                            } else {
                                addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].price.items[j].priceUsdAnnual;
                            }
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
                    addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "A$" + addonPrices[i].price.items[0].priceAudAnnual;
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

    function searchAddonPrice(text, array) {
        for (var i = 0; i < array.length; i++) {
            if (text == array[i].title || (text == "Freddy Self Service" && array[i].title == "Freshbots by Freddy Self Service")) {
                return array[i].price;
            }
        }
        return null;
    }

    function returnValidAddonPrice(index, array) {
        if (array.items[index]) {
            return array.items[index];
        } else {
            return array.items[0];
        }
    }

    function freshserviceAddonCheck(obj) {
        if (obj == "Asset Pack") {
            return true;
        } else if (obj == "Freddy AI Copilot") {
            return true;
        } else if (obj == "SaaS Management") {
            return true;
        } else if (obj == "Business Agent License (See what’s included)") {
            return true;
        } else if (obj == "E-signature") {
            return true;
        } else if (obj == "Orchestration Transaction Packs") {
            return true;
        } else if (obj == "Connector App Tasks") {
            return true;
        } else if (obj == "@mentions, Private Projects & Additional Project Management Licenses") {
            return true;
        } else {
            return false;
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