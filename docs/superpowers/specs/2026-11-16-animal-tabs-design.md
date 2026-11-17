# Animal tabs and workspace navigation

Approved iteratively by the user in the running app. Reuse browser-style document tabs and enterprise settings-dialog navigation, adapted to the clinical teal/neutral theme.

Tabs replace only patient identity in the header. Preserve practice identity and chart actions. Show animal name, raw patient number, and localized visit date. One tab represents an animal; its visit dropdown sits next to the close control. The plus follows the last tab, staying at the visible edge on overflow, and opens Patients as a modal. No redundant Patients, Current visit, or Practice settings sidebar destinations. Closing the final tab shows an empty workspace.

Cloud transitions capture independent per-visit working copies and save/conflict metadata; they do not force an incomplete chart to save before switching. Pause autosave during capture/transition and resume afterwards. Restore clean versus dirty baselines correctly. Unsaved charts offer a close-without-saving confirmation. Confirmed discard of a never-saved chart removes its uploads only after checking that no saved chart exists; saved-chart images remain intact. Closed drafts do not continue autosaving. Local trial snapshots remain reopenable during the session. Native navigation remains unchanged.

An unlocked historical visit has an amber top edge and compact Editing label. Read-only information belongs beside the chart content. Save feedback uses the shared bottom toast stack: amber unsaved, teal saved, red failures with retry. Saved confirmation expires. No separate tab-strip underline: tabs meet the header border.

Practice settings opens from the bottom-left account menu or practice identity as a modal, retaining left section navigation on desktop and responsive navigation on phones. Missing logos show an outlined Add logo control. Practice name and doctor name form one compact clickable identity block. Mobile More uses an accessible ellipsis icon.

Imaging has no image-count text. A full-width divider with 16px spacing above and below separates Radiographic findings from images.

All new text uses translations for en/fr/de/it/es. Preserve focus handling, 44px phone controls, and unsaved settings guards.

## Uploaded-image controls

Use persistent form labels (Atlassian form pattern) and a visible Remove image button with confirmation. Show Image type and Tooth, a labeled optional Description, explicit In clinical PDF inclusion, and a labeled Owner report selector whose empty value is Not in owner report. Description remains the existing caption stored with the attachment and used in exported reports. Keep viewing the image as its primary action; keep original DICOM download as a quiet link beside Remove image. Preserve the existing removal confirmation and save-on-blur behavior. Use consistent control heights, 44px phone targets, and wrapping labels on narrow cards.

Image results are scoped to the exact chart UUID, including unnamed animals. In-flight uploads block tab closing; late image results cannot populate another chart. Recent orphaned uploads from the signed-in user recover into unnamed tabs; explicitly discarded tabs stay closed.
