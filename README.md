# FRSH-PriceView

Chrome Webstore - https://chromewebstore.google.com/detail/frsh-priceview/bbmimfdmijoaefhmobocdllhhdpjnkoc

Switch currencies, and generate customer quotes, on the Freshworks pricing pages.

This app allows you to switch between available currencies on the following Freshworks pricing pages:
- Freshservice for IT teams - freshworks.com/freshservice/pricing/
- Freshservice for MSPs - freshworks.com/freshservice/msp/pricing/
- Freshservice for Business Teams - freshworks.com/freshservice/business-teams/pricing/
- Freshservice IT Asset Management - freshworks.com/freshservice/itam/pricing/
- Freshdesk - freshworks.com/freshdesk/pricing/
- Freshdesk Omni - freshworks.com/freshdesk/omni/pricing/
- Freshcaller - freshworks.com/freshcaller-cloud-pbx/pricing/
- Freshchat (live chat) - freshworks.com/live-chat-software/pricing/
- Freshsales (CRM) - freshworks.com/crm/pricing/
- Freshsales Suite - freshworks.com/crm/suite/pricing/
- Freshmarketer - freshworks.com/crm/marketing/pricing/

Support for Freshservice for CX is coming soon. The other Freshworks pricing pages (Omnichannel, comparison pages, etc.) aren't supported yet while they're checked against the redesigned site.

The steps are simple:
1. Install the App
2. Pin the app
3. Visit any Freshworks pricing sheet
4. Click the extension to switch between prices. 

Important
When viewing the price of addons which are dependent on an option you choose, please ensure that you choose the value you want to pick and then click the extension to switch through the prices.

Generate Quote
Right-click any price on a supported pricing page (or right-click the extension icon itself) and choose "Generate Quote" to open a quote builder:
- The clicked plan and license cost are added as the first line item (right-clicking anywhere in a plan's card - the price, a feature bullet, the CTA button - resolves to that same plan). Every line item has its own Billing Cycle dropdown (Annual / Monthly / Quarterly / Half-yearly) that you can change any time, not just what was active on the page when you right-clicked - it updates the unit price and Invoice Value shown for that line, without changing the line's ARR. Set the number of licenses and a discount % too.
- Use "+ Add addon" to add any addon that's actually valid for that plan (pulled from the pricing page's own JSON, including addons like Freddy AI Copilot that live in the plan summary rather than the feature list), and "+ Add plan" to quote multiple plans/products from the same page - including Custom/"Contact us" plans, which still carry a real list price internally.
- Toggle "Direct Customer" / "Reseller Customer" per quote. In Reseller mode, each line gets a Partner Margin % and a computed Partner Cost (annual cost minus that margin).
- A summary panel shows the quote's Total ARR and total discount applied (amount and blended %).
- Build multiple quotes side by side with the quote tabs, styled like the site's own category pill selector (double-click a tab to rename it, e.g. "Direct" vs "Reseller"; deleting a quote renumbers the default "Quote N" names of the ones after it). Mark one quote as the customer's current subscription to see a green (cost increase) or red (cost decrease) ARR delta on every other quote.
- Download the quote(s) you choose as an Excel file, or open a pre-filled email with a plain-text summary of the quote(s) you choose.
- Right-clicking the extension icon (rather than a specific price) opens the same builder empty, so you can pick the plan yourself - the product is whichever pricing page you're currently on.
This is an estimate only, generated from the pricing shown on the page - not a binding quote.

Support:
joseph.kuriackal@freshworks.com

Changelog:
v2.3.0 - September 2, 2026
- Fixed the ARR delta on a non-current quote to color green when it costs more than the current subscription and red when it costs less (was inverted)
- Fixed quote numbering: deleting a quote now renumbers the default "Quote N" names of the ones after it, so a new quote reuses the freed-up number instead of always incrementing
- Billing cycle (Annual/Monthly/Quarterly/Half-yearly) is now a dropdown on every line item that can be changed at any time, instead of being fixed to whichever cadence was active on the page when you right-clicked
- Renamed the "Annual Cost" column to "Invoice Value" and it now reflects the line's actual per-billing-cycle charge (Total ARR in the summary panel is still always annualized)
- Restyled the quote tabs to match the site's own IT Service/Customer Service category pill selector
- Replaced the CSV download with an Excel-compatible download (an .xls file with a proper column layout) to avoid CSV formatting/encoding issues in Excel
- Fixed "Email quote" to actually open the mail app/Gmail compose window instead of doing nothing

v2.2.0 - September 2, 2026
- Generate Quote: replaced the separate Monthly/Annual cost columns with a single Annual Cost (ARR) column, and added a Monthly/Quarterly/Half-yearly invoicing cadence dropdown for month-to-month plans
- Added a quote summary panel (Total ARR, total discount applied) and a "Clear quote" button
- Fixed addon detection to also pick up addons embedded in a plan's summary text (e.g. Freddy AI Copilot), not just the feature comparison table
- "+ Add plan" now includes Custom/"Contact us" plans (e.g. Enterprise), which still have a real list price behind the public "Custom" label
- Added support for multiple quotes per session (tabs, rename, remove) so you can compare scenarios like Direct vs Reseller, plus a "mark as current subscription" baseline that shows an ARR delta on every other quote
- Added CSV export and a pre-filled email option, both with a picker for which quote(s) to include
- Restyled the quote modal to match freshworks.com more closely: the extension icon plus a serif "FRSH PriceView" title, "Generate Quote" as a subheading, and a cream/white card layout

v2.1.0 - September 2, 2026
- Added "Generate Quote": a right-click context menu (on a price, or on the extension icon) that opens an in-page quote builder - product/plan/billing cycle/license cost, quantity, per-line discount, addons scoped to the clicked plan's actual valid addons, and a Direct/Reseller toggle with per-line partner margin % and partner cost when reselling
- Works across all 11 supported pricing pages

v2.0.2 - September 2, 2026
- Redesigned the install page (installed.html) to match freshworks.com's own look and feel: warm off-white background, black/white pill buttons, and a serif display accent for the tagline, with colors sampled directly from the live site
- Replaced the extension icon (16 through 256px) with an original mark using the same vibrant multicolor palette as Freshworks' current logomark (sampled from their live site assets, not a copy of the mark itself); the new icon is used everywhere the extension shows an icon - toolbar, chrome://extensions, and the install page

v2.0.1 - September 1, 2026
Major rework of the extension for the redesigned Freshworks pricing pages:
- Rebuilt the pricing logic against the new Contentful JSON shape (pricingDetails.pricingPlansCollection) and new HTML structure (stable classnames/data attributes instead of styled-components hashes)
- Addon and "Compare features" table pricing (E-signature, Freddy AI Copilot, Business Agent License, Orchestration Transaction Packs, Connector App Tasks, @mentions, Day passes, etc.) is now derived directly from each page's JSON instead of a hardcoded addon list
- Added support for Freshservice (IT teams, MSPs, Business Teams, IT Asset Management), Freshdesk, Freshdesk Omni, Freshcaller, Freshchat (live chat), and the CRM pricing pages (Freshsales, Freshsales Suite, Freshmarketer)
- Support for Freshservice for CX is coming soon
- Removed all legacy code, permissions, and orphaned files (popup.html/js/css) for pages using the old site structure

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
