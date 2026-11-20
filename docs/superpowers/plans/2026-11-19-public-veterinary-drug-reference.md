# Public veterinary drug reference

- Verify DailyMed search and label retrieval with public veterinary examples and cover the parser and HTTP boundary with tests.
- Add an in-app search and verified label details alongside current medications. Keep drug-name submission explicit and credential-free.
- Localize the panel and Help, capture a synthetic visit and verify desktop and phone layouts.

## Chrome coverage

| Screen and visit state | Checked states | Viewport widths | Themes |
| --- | --- | --- | --- |
| Consultation with empty medication history | Search open and no results | 1440, 390, 320 | Light and dark |
| Consultation with multiple visits and a long patient name | Search open and product label expanded | 1440, 390, 320 | Light and dark |
| Read-only consultation | Search open and upstream failure with fallback link | 1440, 390, 320 | Light and dark |
| Consultation Help guide | Direct link, screenshot loading and page width | 1440, 390, 320 | Light |
| Consultation using the live DailyMed service | Carprofen search and product label opened | 1440 | Light |

The live service was checked on localhost in desktop Chrome. The native app and a Vercel deployment were outside this check.
