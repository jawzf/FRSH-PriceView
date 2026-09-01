# FRSH-PriceView

Chrome Webstore - https://chromewebstore.google.com/detail/frsh-priceview/bbmimfdmijoaefhmobocdllhhdpjnkoc

Switch between prices in different currencies on the Freshservice pricing pages.

This app allows you to switch between available currencies on the Freshservice pricing pages:
- IT teams - freshworks.com/freshservice/pricing/
- MSPs - freshworks.com/freshservice/msp/pricing/
- Business Teams - freshworks.com/freshservice/business-teams/pricing/
- IT Asset Management - freshworks.com/freshservice/itam/pricing/

Support for Freshservice for CX is coming soon. Support for the other Freshworks pricing pages (Freshdesk, Freshchat, Freshcaller, CRM, Omnichannel, etc.) was removed while those pages are rebuilt against the redesigned site.

The steps are simple:
1. Install the App
2. Pin the app
3. Visit any Freshworks pricing sheet
4. Click the extension to switch between prices. 

Important
When viewing the price of addons which are dependent on an option you choose, please ensure that you choose the value you want to pick and then click the extension to switch through the prices.

Support:
joseph.kuriackal@freshworks.com

Changelog:
v1.76.1 - September 1, 2026
- Added support for the Freshservice for MSPs, Business Teams, and IT Asset Management pricing pages (same underlying page structure as Freshservice for IT teams)
- Support for Freshservice for CX pricing is coming soon

v1.76.0 - September 1, 2026
- Rebuilt the extension to match the redesigned Freshservice pricing page (new Contentful JSON shape under pricingDetails.pricingPlansCollection, and new HTML structure with stable classnames/data attributes instead of styled-components hashes)
- Addon and "Compare features" table pricing (E-signature, Freddy AI Copilot, Business Agent License, Orchestration Transaction Packs, Connector App Tasks, @mentions) is now derived directly from the page's JSON instead of a hardcoded addon list
- Removed all legacy code and permissions for the other Freshworks pricing pages (Freshdesk, Freshchat, Freshcaller, CRM, Omnichannel, comparison pages); the extension now only runs on freshworks.com/freshservice/pricing/

v1.75beta2 - March 10, 2026
- Fixed references to new class names
v1.75beta1 - November 14, 2025
- Updated the code to fix the main pricing
- The addon pricing is being reworked and is in progress
- Freshcaller and FS for MSP still in progress
v1.74 - August 5, 2025
- Updated the extension to support the latest website changes
- Fixed Bug with FS Enterprise Pricing
- Fixed the new addon name for Copilot and Insights

v1.73beta5 - January 15, 2025
- Updated the code to support the latest changes to the website with the Freshservice Enterprise Price.
- Added a fix to handle branding changes of Freddy AI

v1.73beta4 - September 19, 2024
- Updated the code to support the latest changes to the website code class including the newer Freshdesk and Freshchat pricing.
- Added a fix to handle GBP pricing for Connector Task on FD pricing page
- Updated currency symbol for AUD to A$
- Added Sandbox add-on modal details
- Fixed Asset Pack price display

v1.73.beta2 - Jul 31, 2024
- Customer Service Suite pricing table updated 90%.
- CSS Main Table Updated. Prices are now displayed correctly
- Campaign Contacts Pop Up in CSS is still a work in progress.

v1.73.beta1 - Jul 26, 2024
- New beta to work with the Customer Service Suite pricing table changes in the website design. This will be in beta, until Freshworks consolidates the design of the entire pricing section.
- Work In Progress. CSS Table Headers updated.
- Calculate Discount Context menu code added.

v1.71 - 25 March 2024
- Updated the extension from beta to release.
- Renamed DEFAULT to FRSH as the default app title.
- Updated the branding as per Freshworks Guidelines.

v1.70beta4 - 23 March 2024 
- All drop downs and pricing corrected to work with the new format. No known issues yet.
- Fixed the bug on Freshchat pricing page due to a change in the "Free" text

v1.70beta2 - 23 March 2024
- Fixed the Freshchat pricing bug.

v1.70beta1 - 31 January 2024
- Refreshed Implementation to work with the new website design. This is a beta and has bugs still being fixed.
- Addons do not work if there is a variable drop down which defines the price. It will be fixed soon.

v1.62(v1.61b) - 30 January 2024
- App is broken. Fix is on the way.

v1.61 - 09 March 2023
- Updated Permissions

v1.6 - 05 March 2023
- Added support for detailed comparison pages for all products
- Added an auto update check to the extension

v1.5 - 03 March 2023
- Added Currency reset on page change
- Added support for drop downs in the addons
- Added installation page
- Added LICENSE

v1.0 - 24 Feb 2023
- Initial release
