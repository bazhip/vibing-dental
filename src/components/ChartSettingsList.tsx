import React from 'react';
import { useTranslation } from 'react-i18next';
import { List, ListRow, ListSection, SwitchRow } from '../ios/List';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';
import { BLOCK_ROW_OPTIONS, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';
import { USUAL_DRUGS, toggleField, useChartSettingsModel } from './useChartSettingsModel';
import '../ios/settings.css';
import type { SettingsSection } from './ChartSettingsModal';

/**
 * Chart settings in the iOS app: the same settings as the web dialog
 * (ChartSettingsModal), as an inset-grouped list — single choices are
 * checkmark rows, on/off settings are switches. Every change applies (and
 * saves) right away, as on the web. Used by the Settings tab's pushed
 * Chart settings screen and by the sheet a chart page's Customize opens.
 */

export interface ChartSettingsListProps {
  prefs: ChartPrefs;
  followsAccount: boolean;
  onChange: (patch: Partial<ChartPrefs>) => void;
  /** Only this page's settings (a page's Customize); null = everything. */
  only: SettingsSection | null;
  /** Shown with `only`: switch to every setting. */
  onShowAll?: () => void;
}

// Pref values (not text).
const GRID = 'grid' as const;
const TOOTH = 'tooth' as const;
const ROOT = 'root' as const;
const FINDING = 'finding' as const;
const STAY = 'stay' as const;


export function ChartSettingsList({ prefs, followsAccount, onChange, only, onShowAll }: ChartSettingsListProps) {
  const { t } = useTranslation('settings');
  // Same rules as the web dialog; a pending usual-anesthetic edit is also
  // saved when the screen or sheet goes away without a blur (iOS Back).
  const { showAll, show, shownColumns, drugName, setDrugName, drugStrength, setDrugStrength, saveUsualDrug, toggleBlock } =
    useChartSettingsModel(prefs, onChange, only, { saveDrugOnUnmount: true });
  const drugListId = React.useId();

  const note = followsAccount ? t('chart.noteAccount') : t('chart.noteDevice');

  return (
    <List className="ios-chart-settings">
      {!showAll && onShowAll && (
        <ListSection footer={note}>
          <ListRow title={<span className="ios-row__tint">{t('chart.allSettings')}</span>} onClick={onShowAll} />
        </ListSection>
      )}

      {show.charting && (
        <>
          <ListSection header={t('chart.view')} footer={showAll ? note : undefined}>
            <ListRow title={t('chart.grid')} selected={prefs.chartingView === GRID} onClick={() => onChange({ chartingView: GRID })} />
            <ListRow title={t('chart.byTooth')} selected={prefs.chartingView === TOOTH} onClick={() => onChange({ chartingView: TOOTH })} />
          </ListSection>
          <ListSection header={t('chart.pocketDepths')}>
            <ListRow title={t('chart.perTooth')} selected={prefs.pocketMode === TOOTH} onClick={() => onChange({ pocketMode: TOOTH })} />
            <ListRow
              title={t('chart.perRoot')}
              subtitle={t('chart.perRootHint')}
              selected={prefs.pocketMode === ROOT}
              onClick={() => onChange({ pocketMode: ROOT })}
            />
          </ListSection>
          <ListSection header={t('chart.spaceKey')}>
            <ListRow
              title={t('chart.spaceMovesDown')}
              subtitle={t('chart.spaceMovesDownHint')}
              selected={prefs.spaceMovesDown}
              onClick={() => onChange({ spaceMovesDown: true })}
            />
            <ListRow title={t('chart.spaceTypes')} selected={!prefs.spaceMovesDown} onClick={() => onChange({ spaceMovesDown: false })} />
          </ListSection>
          <ListSection header={t('chart.scoreTap')}>
            <ListRow
              title={t('chart.scoreTapFinding')}
              subtitle={t('chart.scoreTapFindingHint')}
              selected={prefs.scoreTapMoves === FINDING}
              onClick={() => onChange({ scoreTapMoves: FINDING })}
            />
            <ListRow
              title={t('chart.scoreTapTooth')}
              subtitle={t('chart.scoreTapToothHint')}
              selected={prefs.scoreTapMoves === TOOTH}
              onClick={() => onChange({ scoreTapMoves: TOOTH })}
            />
            <ListRow title={t('chart.scoreTapStay')} selected={prefs.scoreTapMoves === STAY} onClick={() => onChange({ scoreTapMoves: STAY })} />
          </ListSection>
          <ListSection header={t('chart.columns')} footer={t('chart.columnsFooter')}>
            {PERIO_FIELDS.map((f) => {
              const shown = !prefs.hiddenColumns.includes(f.key);
              return (
                <SwitchRow
                  key={f.key}
                  title={t(`chart.field.${f.key}`)}
                  checked={shown}
                  // Keep at least one column.
                  disabled={shown && shownColumns.length === 1}
                  onChange={(on) => onChange({ hiddenColumns: toggleField(prefs.hiddenColumns, f.key, !on) })}
                />
              );
            })}
          </ListSection>
        </>
      )}

      {show.beside && (
        <>
          <ListSection header={t('chart.besideTeeth')}>
            <SwitchRow
              title={t('chart.mirror')}
              subtitle={t('chart.mirrorHint')}
              checked={prefs.mirrorToDiagnosis}
              onChange={(on) => onChange({ mirrorToDiagnosis: on })}
            />
          </ListSection>
          <ListSection header={t('chart.include')}>
            {shownColumns.map((f) => (
              <SwitchRow
                key={f.key}
                title={t(`chart.field.${f.key}`)}
                checked={prefs.besideTeeth.includes(f.key)}
                disabled={!prefs.mirrorToDiagnosis}
                onChange={(on) => onChange({ besideTeeth: toggleField(prefs.besideTeeth, f.key, on) })}
              />
            ))}
          </ListSection>
        </>
      )}

      {show.anesthesia && (
        <>
          <ListSection header={t('chart.blocksShown')} footer={t('chart.blocksNote')}>
            {BLOCK_ROW_OPTIONS.map((b) => (
              <SwitchRow
                key={b.id}
                title={t(`chart.block.${b.id}`)}
                checked={!prefs.hiddenBlocks.includes(b.id)}
                onChange={(on) => toggleBlock(b.id, on)}
              />
            ))}
          </ListSection>
          <ListSection>
            <div role="listitem" className="ios-list__item ios-cell-embed">
              <AnesthesiaCustomEditor
                blocks={prefs.customBlocks}
                fields={prefs.customFields}
                onBlocksChange={(customBlocks) => onChange({ customBlocks })}
                onFieldsChange={(customFields) => onChange({ customFields })}
              />
            </div>
          </ListSection>
          <ListSection header={t('chart.usualDrug')} footer={t('chart.usualDrugNote')}>
            <div role="listitem" className="ios-list__item">
              <label className="ios-row ios-row--field">
                <span className="ios-row__main">
                  <span className="ios-row__title">{t('chart.drugName')}</span>
                  <input
                    type="text"
                    list={drugListId}
                    className="ios-field"
                    placeholder={t('chart.drugPlaceholder')}
                    aria-label={t('chart.drugLabel')}
                    value={drugName}
                    onChange={(e) => setDrugName(e.target.value)}
                    onBlur={saveUsualDrug}
                  />
                </span>
              </label>
            </div>
            <div role="listitem" className="ios-list__item">
              <label className="ios-row ios-row--field">
                <span className="ios-row__main">
                  <span className="ios-row__title">{t('chart.drugStrength')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ios-field"
                    placeholder="0.5"
                    aria-label={t('chart.strengthLabel')}
                    value={drugStrength}
                    onChange={(e) => setDrugStrength(e.target.value.replace(/%/g, ''))}
                    onBlur={saveUsualDrug}
                  />
                  <span className="ios-field__suffix" aria-hidden="true">%</span>
                </span>
              </label>
            </div>
            <datalist id={drugListId}>
              {USUAL_DRUGS.map((d) => <option key={d} value={d} />)}
            </datalist>
          </ListSection>
        </>
      )}

      {show.patient && (
        <ListSection header={t('chart.patientPage')}>
          <SwitchRow title={t('chart.hideRecheck')} checked={prefs.hideRecheck} onChange={(on) => onChange({ hideRecheck: on })} />
        </ListSection>
      )}

      {(show.pdfGrid || show.pdfImages) && (
        <ListSection header={t('chart.pdf')}>
          {show.pdfGrid && (
            <SwitchRow
              title={t('chart.pdfGrid')}
              subtitle={t('chart.pdfGridHint')}
              checked={!prefs.mirrorToDiagnosis || prefs.pdfIncludeGrid}
              disabled={!prefs.mirrorToDiagnosis}
              onChange={(on) => onChange({ pdfIncludeGrid: on })}
            />
          )}
          {show.pdfImages && (
            <SwitchRow
              title={t('chart.pdfImages')}
              subtitle={t('chart.pdfImagesHint')}
              checked={prefs.pdfIncludeImages}
              onChange={(on) => onChange({ pdfIncludeImages: on })}
            />
          )}
        </ListSection>
      )}
    </List>
  );
}
