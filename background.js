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
                args: [currency[priceCount - 1].code,nextState],
            })
            .then(() => console.log("injected the currency function"));

        if (priceCount == 5) priceCount = 0;
    }

});

function initialiseDropDown(curr) {
}


function setCurrency(curr,nextState) {
    var addData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
    //console.log(addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection);
    var currentPricingData = addData.props.pageProps.pageProps.componentsCollection.items[1].pricingPlansCollection;
    var numberOfAddons = addData.props.pageProps.pageProps.componentsCollection.items.length - 4;
    //console.log(numberOfAddons);

    //Pulling the addon prices
    const addonPrices = [];
    for(var i=0;i<numberOfAddons;i++){
        addonPrices[i] = addData.props.pageProps.pageProps.componentsCollection.items[i+3].pricingCollection;
    }
    //console.log(addonPrices);

    var pricTablePlan = document.getElementsByClassName("sc-ace17a57-0 bDJUlF")[0].childNodes[5].childNodes;
    //console.log(pricTablePlan);


    //identifying the billing cycle
    var annualTerm = true;
    var pricingTermDiv = document.querySelector('[aria-label="Pricing Term"]').childNodes;
    //console.log(pricingTermDiv);
    if(pricingTermDiv[0].ariaPressed == "true" && pricingTermDiv[1].ariaPressed == "false"){
        annualTerm = false;
    }
    //console.log("annualTerm:"+annualTerm);

    //Update the currency and price on the main Table
    for(var i=0;i<pricTablePlan.length;i++){
        if(nextState == "USD"){
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsdAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsd;
            }
        } else if(nextState == "EUR"){
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceEurAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "€"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceEur;
            }
        } else if(nextState == "GBP"){
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceGbpAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "£"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceGbp;
            }
        } else if(nextState == "INR"){
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceInrAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "₹"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceInr;
            }
        } else if(nextState == "AUD"){
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceAudAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "AUD"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceAud;
            }
        } else {
            if(annualTerm){
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsdAnnual;
            } else {
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[0].innerHTML = "$"
                pricTablePlan[i].childNodes[1].childNodes[0].childNodes[1].childNodes[1].innerHTML = currentPricingData.items[i].priceUsd;
            }
        }
    }


    //Updating the popups
    var addonPopup = document.querySelectorAll(".sc-ace17a57-0.kChrSf");
    console.log(addonPopup);
    console.log(addonPopup[0].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0])// = addonPrices[i].items[0].priceUsdAnnual;
    console.log(addonPrices[0].items[0].priceUsdAnnual);
    
    for(var i=0;i<addonPopup.length;i++){
        if(nextState == "USD"){
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].items[0].priceUsdAnnual;
        } else if(nextState == "EUR"){
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "€" + addonPrices[i].items[0].priceEurAnnual;
          
        } else if(nextState == "GBP"){
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "£" + addonPrices[i].items[0].priceGbpAnnual;
  
        } else if(nextState == "INR"){
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "₹" + addonPrices[i].items[0].priceInrAnnual;
 
        } else if(nextState == "AUD"){
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "AUD" + addonPrices[i].items[0].priceAudAnnual;
   
        } else {
            addonPopup[i].childNodes[0].childNodes[1].childNodes[0].childNodes[1].childNodes[0].childNodes[0].childNodes[0].innerHTML = "$" + addonPrices[i].items[0].priceUsdAnnual;

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