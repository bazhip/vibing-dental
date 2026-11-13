/* DEV-only component gallery: `?iosPreview=1&iosGallery=1` on the dev
 * server. Never bundled into production (index.tsx only imports it behind
 * import.meta.env.DEV). Sample text is fixture data for designers and
 * reviewers, not user-facing copy, so it isn't translated. */
import React from 'react';
import { Icon, ICON_NAMES } from './icons';
import { NavBar } from './NavBar';
import { TabBar } from './TabBar';
import { Stack, useStack } from './Stack';
import { List, ListRow, ListSection, SwitchRow } from './List';
import { SwipeRow } from './SwipeRow';
import { ContextMenu } from './ContextMenu';
import { Sheet } from './Sheet';
import { chooseDialog, confirmDialog, promptDialog, toast } from '../components/ui/dialogs';

const TABS = [
  { id: 'chart', label: 'Chart', icon: 'tooth' as const },
  { id: 'patients', label: 'Patients', icon: 'person-2' as const },
  { id: 'rechecks', label: 'Rechecks', icon: 'calendar-badge-clock' as const, badge: 3 },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
];

function Detail({ name }: { name: string }) {
  const { push, depth } = useStack();
  return (
    <List>
      <ListSection header="Pushed screen" footer={`Depth ${depth}. Swipe from the left edge to go back.`}>
        <ListRow title="Patient" value={name} />
        <ListRow
          title="Push another"
          accessory="chevron"
          onClick={() => push({ id: `more-${depth}`, title: 'Visit 12 May 2026', render: () => <Detail name={`${name} (again)`} /> })}
        />
      </ListSection>
    </List>
  );
}

function Root({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { push } = useStack();
  const [mode, setMode] = React.useState('Perio');
  const [style, setStyle] = React.useState('Compact');
  const [faceId, setFaceId] = React.useState(true);
  const [reminders, setReminders] = React.useState(false);
  const [sheet, setSheet] = React.useState<null | 'large' | 'detents' | 'draft' | 'second'>(null);
  const [draft, setDraft] = React.useState('');
  const [patients, setPatients] = React.useState(['Jane Doe', 'Arturo Méndez', 'Chloé Martin']);

  return (
    <>
      <NavBar
        title="Kit gallery"
        subtitle={mode}
        largeTitle
        scrollRef={scrollRef}
        titleMenu={['Perio', 'Restorative', 'Hygiene'].map((m) => ({ label: m, checked: m === mode, onSelect: () => setMode(m) }))}
        leading={
          <button type="button" className="ios-glass-button ios-glass-button--icon" aria-label="Sidebar">
            <Icon name="sidebar-left" />
          </button>
        }
        trailing={
          <>
            <button type="button" className="ios-glass-button ios-glass-button--icon" aria-label="Share">
              <Icon name="square-and-arrow-up" />
            </button>
            <button type="button" className="ios-glass-button ios-glass-button--icon" aria-label="Add">
              <Icon name="plus" />
            </button>
          </>
        }
      />
      <List>
        <ListSection header="Navigation" footer="Rows with a chevron push a screen onto the stack.">
          <ListRow icon="person-2" title="Patients" value="128" accessory="chevron" onClick={() => push({ id: 'p', title: 'Patients', render: () => <Detail name="Jane Doe" />, trailing: <button type="button" className="ios-glass-button ios-glass-button--icon" aria-label="Search"><Icon name="magnifyingglass" /></button> })} />
          <ListRow icon="calendar-badge-clock" title="Rechecks" subtitle="3 due this week" accessory="chevron" onClick={() => push({ id: 'r', title: 'Rechecks', render: () => <Detail name="Arturo Méndez" /> })} />
          <ListRow icon="bell" title="Notifications" value="On" accessory="chevron" onClick={() => {}} />
        </ListSection>

        <ListSection header="PDF style">
          {['Compact', 'Detailed', 'Custom'].map((s) => (
            <ListRow key={s} title={s} accessory={s === style ? 'check' : undefined} onClick={() => setStyle(s)} />
          ))}
        </ListSection>

        <ListSection header="Security" footer="Switches use the ToothOps tint and play a selection haptic.">
          <SwitchRow title="Require Face ID" subtitle="When the app opens" checked={faceId} onChange={setFaceId} />
          <SwitchRow title="Recheck reminders" checked={reminders} onChange={setReminders} />
          <SwitchRow title="Cloud sync" checked disabled onChange={() => {}} />
        </ListSection>

        <ListSection header="Swipe and long-press" footer="Swipe a row left for actions; a full swipe deletes. Long-press the last row for a menu.">
          {patients.map((p) => (
            <SwipeRow
              key={p}
              actions={[
                { label: 'Delete', icon: 'trash', tone: 'destructive', onAction: () => setPatients((list) => list.filter((x) => x !== p)) },
                { label: 'Recheck', icon: 'clock-arrow-circlepath', tone: 'tint', onAction: () => toast(`Recheck set for ${p}`, { kind: 'success' }) },
              ]}
            >
              <ListRow title={p} subtitle="Last visit 3 May 2026" accessory="chevron" onClick={() => toast(`Open ${p}`)} />
            </SwipeRow>
          ))}
          <ContextMenu
            items={[
              { label: 'Duplicate', icon: 'doc-text', onSelect: () => toast('Duplicated') },
              { label: 'Share', icon: 'square-and-arrow-up', onSelect: () => toast('Shared') },
              { label: 'Delete Visit', icon: 'trash', destructive: true, onSelect: () => toast('Deleted', { kind: 'error' }) },
            ]}
          >
            <ListRow title="Visit 12 May 2026" subtitle="Long-press me" onClick={() => toast('Tapped (short press)')} />
          </ContextMenu>
        </ListSection>

        <ListSection header="Sheets">
          <ListRow title="Large sheet" accessory="chevron" onClick={() => setSheet('large')} />
          <ListRow title="Medium + large detents" accessory="chevron" onClick={() => setSheet('detents')} />
          <ListRow title="Compose (unsaved changes confirm)" accessory="chevron" onClick={() => { setDraft(''); setSheet('draft'); }} />
        </ListSection>

        <ListSection header="Alerts">
          <ListRow title="Confirm" onClick={() => void confirmDialog({ title: 'Replace template?', message: 'Your current template will be overwritten.', confirmLabel: 'Replace' })} />
          <ListRow title="Destructive confirm" destructive onClick={() => void confirmDialog({ title: 'Delete this visit?', message: 'This can’t be undone.', confirmLabel: 'Delete', danger: true })} />
          <ListRow title="Prompt" onClick={() => void promptDialog({ title: 'Template name', placeholder: 'e.g. Perio recall', validate: (v) => (v.trim() ? null : 'Enter a name.') })} />
          <ListRow title="Action sheet" onClick={() => void chooseDialog({ title: 'Discard this reminder?', choices: [{ value: 'd', label: 'Discard Changes', destructive: true }, { value: 'k', label: 'Keep Editing' }] })} />
          <ListRow title="Toast: success" onClick={() => toast('Chart saved', { kind: 'success' })} />
          <ListRow title="Toast: error" onClick={() => toast('Couldn’t reach ToothOps', { kind: 'error' })} />
          <ListRow title="Toast: with action" onClick={() => toast('Column cleared', { action: { label: 'Undo', onClick: () => {} } })} />
        </ListSection>

        <ListSection header="Icons">
          <div role="listitem" className="ios-gallery__icons">
            {ICON_NAMES.map((n) => (
              <span key={n} className="ios-gallery__icon" title={n}>
                <Icon name={n} size={26} />
                <Icon name={n} size={26} filled />
                <small>{n}</small>
              </span>
            ))}
          </div>
        </ListSection>
      </List>

      <Sheet open={sheet === 'large'} onClose={() => setSheet(null)} title="Chart history" onCancel={() => {}} onDone={() => setSheet(null)}>
        <List>
          <ListSection header="Versions">
            {Array.from({ length: 30 }, (_, i) => (
              <ListRow key={i} title={`Saved ${30 - i} Oct 2026, 10:${String(i).padStart(2, '0')}`} subtitle="Dr Martin" accessory="chevron" onClick={() => {}} />
            ))}
          </ListSection>
        </List>
      </Sheet>

      <Sheet open={sheet === 'detents'} onClose={() => setSheet(null)} title="What’s new" detents={['medium', 'large']}>
        <List>
          <ListSection header="This release" footer="Drag up to expand; drag down from the top to dismiss.">
            {Array.from({ length: 20 }, (_, i) => (
              <ListRow key={i} icon="checkmark-circle" title={`Improvement ${i + 1}`} subtitle="Smoother charting on iPad" />
            ))}
            <ListRow title="Open another sheet (closes this one)" accessory="chevron" onClick={() => setSheet('second')} />
          </ListSection>
        </List>
      </Sheet>

      <Sheet open={sheet === 'second'} onClose={() => setSheet(null)} title="Second sheet">
        <List><ListSection><ListRow title="Only one sheet at a time." /></ListSection></List>
      </Sheet>

      <Sheet
        open={sheet === 'draft'}
        onClose={() => setSheet(null)}
        title="New reminder"
        onCancel={() => {}}
        doneLabel="Send"
        doneDisabled={!draft.trim()}
        onDone={() => { setSheet(null); toast('Reminder sent', { kind: 'success' }); }}
        confirmDismiss={async () => !draft || (await chooseDialog({ title: 'Discard this reminder?', choices: [{ value: 'discard', label: 'Discard Changes', destructive: true }] })) === 'discard'}
      >
        <List>
          <ListSection header="Message" footer="Type something, then swipe down: you’ll be asked to discard.">
            <div role="listitem" className="ios-gallery__field">
              <textarea aria-label="Message" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Hi Jane, it’s time for your recheck…" />
            </div>
          </ListSection>
        </List>
      </Sheet>
    </>
  );
}

export default function Gallery() {
  const [tab, setTab] = React.useState('chart');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    // The root layer of the stack is the scroll container.
    scrollRef.current = document.querySelector<HTMLDivElement>('.ios-gallery .ios-stack__layer');
  });
  return (
    <div className="ios-gallery">
      <style>{GALLERY_CSS}</style>
      <Stack root={<Root scrollRef={scrollRef} />} rootTitle="Kit gallery" />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
    </div>
  );
}

const GALLERY_CSS = `
html.native-ios body { margin: 0; background: var(--ios-bg-grouped); }
.ios-gallery { position: fixed; inset: 0; }
.ios-gallery .ios-list { padding-bottom: 120px; }
.ios-gallery__icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 12px; padding: 16px; color: var(--ios-label); }
.ios-gallery__icon { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; text-align: center; }
.ios-gallery__icon small { flex-basis: 100%; font-size: 10px; color: var(--ios-label-muted); overflow-wrap: anywhere; }
.ios-gallery__field { padding: 12px 16px; }
.ios-gallery__field textarea { width: 100%; box-sizing: border-box; border: 0; background: transparent; color: var(--ios-label); font: inherit; resize: none; outline: none; }
`;
