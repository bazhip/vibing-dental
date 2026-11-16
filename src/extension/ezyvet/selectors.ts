// ezyVet selectors, taken from the reference table in the design spec. Unverified on a live
// page: when one breaks, the diagnostic report's `selectorHits` (keyed by these constant names)
// shows which one stopped matching. Keep every selector here so there is one place to fix.

export const RIGHT_PANE = '#rightpane';
export const ACTIVE_PANE = '#rightpane .rtabdetails.active[id^="rtab"]';
export const ACTIVE_SUBTAB_DETAILS = '#rightpane .rtabdetails.active .subTab-details.active';
export const LOCKED_TOOLBAR = '.theTabsToolbar div[title="Locked"]';
export const COMBINED_VIEW_BUTTON = '[data-testid="GotoStandardView"]';
// Best guess (the real selector is unknown): the patient link in the active pane's header.
export const PATIENT_NAME = '#rightpane .rtabdetails.active .consultHeader a.patientLink';

export const SECTION_CONTENT = '.sectionContent';
export const NOTE_SECTION_TITLE = 'h2';
export const NOTE_EDITABLE = '[contenteditable="true"]';
export const NOTE_EDITOR_CONTAINER = '.lexical-editor-container';
export const NOTE_ADD_BUTTON = '.add-note-button svg[aria-label="Add Note"]';
export const POPUP_TITLE = 'div.sectionContent .inputSection .inputSectionTitle';
export const POPUP_ADD_BUTTON = '.addButton.clickable';
export const ADD_CLIENT_COMMUNICATION = '.addButton[data-testid="AddClientCommunication"]';
export const DISCHARGE_ADD_BUTTON = '.inputSectionTitle .addButton[data-testid="AddDischargeSummary"]';
/** Class prefix of the Discharge Summary `.sectionContent`; popup discovery skips these. */
export const DISCHARGE_SECTION_CLASS_PREFIX = 'DischargeSummaries';

// Writing side. All unverified: reference.
export const ADD_NOTE_BUTTON = '.add-note-button'; // unverified: reference
export const FORMBOX = '[id^="formbox"]'; // unverified: reference
export const POPUP_FORM_INTERNAL = '.popupFormInternal'; // unverified: reference
export const POPUP_SAVE_BUTTON = '[id^="saveRecord"]'; // unverified: reference
export const POPUP_CLOSE_BUTTON = '.closeButton'; // unverified: reference
export const POPUP_TEXTAREA = 'textarea'; // unverified: reference
export const CONTACT_EMAIL = '.clickable.contactMethodSelectionItem[title="Email"]'; // unverified: reference
export const CONTACT_IN_PERSON = '.clickable.contactMethodSelectionItem[title="In Person"]'; // unverified: reference
export const IN_PERSON_TEXTAREA = 'textarea[name="communicationdata_content"]'; // unverified: reference
export const IN_PERSON_ADD = '[data-testid="Add"]'; // unverified: reference
export const EMAIL_TO_INPUT = 'input[name="communicationdata_to"]'; // unverified: reference
export const PREFERRED_ADDRESS = '.preferredMethod'; // unverified: reference
export const EMAIL_STATUS_PENDING = 'input[type="radio"][value="Pending"]'; // unverified: reference
export const TEMPLATE_CHOOSER_CANCEL = '[data-testid="Cancel"]'; // unverified: reference
// `&` is written as the CSS escape `\26 ` (same selector; jsdom's engine mis-parses a literal `&`).
export const DISCHARGE_SAVE_CLOSE = [
  '[data-testid="Save\\26 Close_DischargeSummary"]',
  '[data-testid^="Save\\26 Close"]',
  '[id^="saveAndCloseButton"]',
]; // unverified: reference
export const COVER_BLOCK = '#coverblock'; // unverified: reference

/** Static selectors reported by `diagnostics().selectorHits`, keyed by constant name. */
export const REPORTED_SELECTORS: Record<string, string> = {
  RIGHT_PANE,
  ACTIVE_PANE,
  ACTIVE_SUBTAB_DETAILS,
  LOCKED_TOOLBAR,
  COMBINED_VIEW_BUTTON,
  PATIENT_NAME,
  SECTION_CONTENT,
  NOTE_EDITABLE,
  NOTE_EDITOR_CONTAINER,
  NOTE_ADD_BUTTON,
  POPUP_TITLE,
  POPUP_ADD_BUTTON,
  ADD_CLIENT_COMMUNICATION,
  DISCHARGE_ADD_BUTTON,
};
