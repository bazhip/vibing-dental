# iOS component kit

App-only components for the ToothOps iOS app. Use them only when `isNativeApp()` is true. Their styles (`ios.css`) apply only under `html.native-ios`.

## Kit rules

- **Keep fixed-position UI outside `<Stack>`.** Stack layers are transformed (and the layer under the top one is also filtered), so inside a layer `position: fixed` is relative to the layer, not the screen. That includes the tab bar, floating buttons and any fixed banner. Sheets, menus, alerts and toasts already render into `<body>` through portals, so you can open them from anywhere.
- **Bar items.**
  - The root screen renders its own `<NavBar>`.
  - Each pushed screen gets a NavBar with a Back button, built from `push({ title, trailing })`.
  - If the bar has to follow the screen's state (a Save button that enables, a changing title), call `useStackScreenOptions({ title, trailing })` from inside the screen.
  - A `trailing` of `undefined` keeps the one given to `push()`. Pass `null` to remove it.
- **Pushed screens are live components.** `render()` runs once, when the screen is pushed. The component it returns reads current data through its own hooks or context; values captured in the `push()` closure don't update.
- **Scroll containers.**
  - Every Stack layer is its own scroll container, so each screen keeps its scroll position.
  - The layer element is provided through `ScrollContainerContext`.
  - `<NavBar largeTitle>` uses that context when no `scrollRef` is passed, and falls back to `window` outside a Stack.
  - A `<Sheet>` provides its body (`.ios-sheet__body`) through the same context, so a `<NavBar>` inside a sheet follows the sheet's scrolling, not the screen behind it.
- **One sheet at a time.** Opening a `<Sheet>` closes the one already open, through its `onClose`, without asking `confirmDismiss`. A choice inside a sheet is a menu (`MenuPopover`), never a second sheet.
- **Sheets from plain code.** `presentSheet(({ open, finish }) => <Sheet open={open} …/>, fallback)` (in `components/ui/dialogs`) shows a one-off sheet through `<DialogHost />` and resolves with the value passed to `finish`.
- **Unsaved changes.** Give the sheet `confirmDismiss={async () => !dirty || (await chooseDialog({ ... })) === 'discard'}`. It covers every dismissal except Done: Cancel, swipe, backdrop and Escape.
- **Navigation.** `useStack()` returns `{ push, pop, popToRoot, depth }`. Use `popToRoot()` when the selected tab is tapped again.
- **Icons.** Take icons from `icons.tsx`. Don't use text glyphs in app chrome.
- **Text.** All text goes through `t()`. The kit files are listed in `src/i18n/extracted.json`, so lint enforces this.
