//const article = document.querySelector("article");


function setCurrency(curr) {
    var pricTablePlan = document.getElementsByClassName("pricing-table-plan-info");
    var addonsPrice = document.getElementsByClassName("add-ons-plan-info");

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