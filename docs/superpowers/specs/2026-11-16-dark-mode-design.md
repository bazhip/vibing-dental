# App-wide appearance

Approved in conversation: System / Light / Dark, default System, remembered on this device. Preserve the clinical teal design and make all screens and dental SVGs readable in either appearance. Printed reports remain light.

## Approach

Extend existing semantic and iOS color tokens, with one resolved `data-theme` on the document. This reuses the established clinical palette and lets artwork adopt specific ink and signal colors. A global inversion filter would distort clinical colors and radiographs; independent per-screen themes would drift.

Expose a translated appearance select on landing/sign-in, in account settings and in the app settings menu (including guest mode). Follow live OS changes only in System mode; synchronize same-origin tabs and tolerate unavailable storage. Apply the preference before rendering. Native chrome follows the resolved theme.

Keep report palettes and exported SVG artwork light independently of the on-screen theme. Preserve user-selected drawing colors and clinical-image pixels. Check desktop and 320/390px phone layouts, menus, dialogs, charts for all species, empty/populated patient states and long names.


## Appearance placement refinement (user approved)

Reference: [Linear account preferences](https://linear.app/docs/account-preferences) and [GitHub appearance settings](https://github.blog/changelog/2021-04-14-dark-and-dimmed-themes-are-now-generally-available/) locate theme choice in personal settings. Reuse that hierarchy in the existing clinical design.

Mockup shown before implementation:

```text
Account settings
  Doctor name       …
  Appearance        [ System ▾ ]
  Language          [ English ▾ ]
  Email             …
```

Signed-in users use Account settings, without a duplicate menu field. Signed-out landing uses a quiet footer disclosure; guest app menus expose the same disclosure. Embedded sign-in has no duplicate appearance control; standalone sign-in and extension place it below the primary content. Native Settings keeps account identity first and exposes the guest preference after chart settings.

The project UI rule now requires enterprise SaaS reference patterns and an appropriately detailed mockup before building a feature or redesign.
