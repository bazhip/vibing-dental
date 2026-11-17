# Professional workspace refresh

Approved direction: the user requested implementation of the full organizational refresh proposed in chat.

Keep the clinical teal/slate design and existing clinical workflows, voice behavior, save protections, native iOS navigation and permissions. Separate patient navigation, visit actions, practice administration, help and account. Make Patients and Practice settings real web destinations. Organize practice settings into General, Team, Templates and Billing, with reminder and chart preference entry points. Preserve patient filters when returning. Tighten terminology and landing copy in all supported app languages. Use consistent accessible, responsive controls and visible patient/visit/save context.

Approaches: a cosmetic-only pass leaves navigation problems; a total visual rewrite risks clinical disruption. Selected approach is a structural refresh using current components and tokens. No invented clinical states or unsupported enterprise/security claims.

Validation: focused navigation/settings/library behavior and pseudo-locale tests, full npm test, npm run build, responsive browser inspection where available. No deployment or merge requested.

## Expanded UI pass (user requested after preview)
The user confirmed the first pass was a good start and requested full UI professionalization. Extend the established clinical design to the chart shell, forms, tables, toolbars, dialogs and settings. Keep efficient clinical data entry and existing semantic status colors. Use white surfaces, cool slate page background, deep teal actions, 14px labels / 16px fields, 20–28px headings, compact 6–10px radii and consistent 40px desktop / 44px mobile action controls. Preserve grid/diagram geometry. Make All patients reachable in the sticky chart header because the workspace navigation scrolls away.

Avoid a second visual brand, oversized decoration, more nested cards, or hidden navigation on compact screens. Native iOS keeps its native controls. Verify every main web section at desktop and mobile sizes, dialog readability, and scrolled patient return.
