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
it('translates study context, generated preview, review and export controls',async()=>{
 render(<Editor/>);fireEvent.click(screen.getByText(i18n.t('app:radiologyReport.context')));
 expect(findUntranslated(document.body,['108: bone loss','English','Français','Deutsch','Italiano','Español','108: documented findings'])).toEqual([]);
 fireEvent.click(screen.getByRole('button',{name:i18n.t('app:radiologyReport.generate')}));
 await screen.findByLabelText(i18n.t('app:radiologyReport.preview'));
 expect(findUntranslated(document.body,['108: bone loss','English','Français','Deutsch','Italiano','Español','108: documented findings'])).toEqual([]);
 fireEvent.click(screen.getByRole('button',{name:i18n.t('app:radiologyReport.use')}));
 fireEvent.click(screen.getByLabelText(i18n.t('app:radiologyReport.checked')));
 expect(findUntranslated(document.body,['108: bone loss','English','Français','Deutsch','Italiano','Español','108: documented findings'])).toEqual([]);
});
