import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import i18n from '../i18n';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import type { ChartSnapshot, PatientInfo } from '../types';
import { RadiologyReportSection } from './RadiologyReportSection';
vi.mock('../utils/radiologyReportAi',()=>({draftRadiologyReport:async()=> '108: documented findings'}));
vi.mock('../native/aiConsent',()=>({ensureAiConsent:async()=>true}));
vi.mock('../utils/supabaseClient',()=>({supabase:null}));
function Editor(){
 const [snapshot,setSnapshot]=React.useState<ChartSnapshot>(()=>{const s=sampleOwnerReportSnapshot();return {...s,patientInfo:{...s.patientInfo,radiographicFindings:'108: bone loss'}};});
 return <RadiologyReportSection snapshot={snapshot} chartId="chart" aiEnabled onChange={(changes:Partial<PatientInfo>)=>setSnapshot(value=>({...value,patientInfo:{...value.patientInfo,...changes}}))}/>;
}
beforeEach(async()=>installPseudoLocale());afterEach(async()=>{cleanup();await restoreLocale();});
it('translates the single editor, refinement, Undo, review and export controls',async()=>{
 render(<Editor/>);
 const allowed=['108: bone loss','English','Français','Deutsch','Italiano','Español','108: documented findings'];
 expect(findUntranslated(document.body,allowed)).toEqual([]);
 fireEvent.click(screen.getByRole('button',{name:i18n.t('app:radiologyReport.refine')}));
 await screen.findByRole('button',{name:i18n.t('app:radiologyReport.undoRefine')});
 expect(findUntranslated(document.body,allowed)).toEqual([]);
 fireEvent.click(screen.getByLabelText(i18n.t('app:radiologyReport.checked')));
 expect(findUntranslated(document.body,allowed)).toEqual([]);
});
