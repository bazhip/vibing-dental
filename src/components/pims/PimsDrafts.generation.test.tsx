import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { PimsDrafts } from './PimsDrafts';
import { sampleOwnerReportSnapshot } from '../../utils/ownerReportSample';
import type { DraftBackend } from '../../utils/pims/drafts';
const mocks=vi.hoisted(()=>({generate:vi.fn(),consent:vi.fn(async()=>true)}));
vi.mock('../../utils/radiologyReportAi',()=>({draftRadiologyReport:mocks.generate}));
vi.mock('../../native/aiConsent',()=>({ensureAiConsent:mocks.consent}));
function backend(){
 const data=sampleOwnerReportSnapshot();data.patientInfo.radiographicFindings='108: 4.5 mm bone loss';
 const source={chart_id:'chart',practice_id:'practice',patient_name:data.patientInfo.patientName,patient_number:data.patientInfo.patientNumber,chart_date:'2026-11-17',updated_at:'2026-11-17T12:00:00Z',hash:'a'.repeat(64),data};
 return {context:vi.fn(async()=>({source,drafts:[]})),write:vi.fn(),export:vi.fn()} satisfies DraftBackend;
}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Prepare history or radiology notes'}));fireEvent.change(await screen.findByLabelText('Draft type'),{target:{value:'radiology'}});}
beforeEach(()=>{vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED','true');mocks.generate.mockReset();mocks.generate.mockResolvedValue('Generated radiology findings');mocks.consent.mockResolvedValue(true);});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
it('previews AI text without replacing existing notes or approving a draft',async()=>{
 const api=backend();render(<PimsDrafts chartId="chart" backend={api} aiEnabled/>);await open();
 fireEvent.change(screen.getByLabelText('Review and edit the notes'),{target:{value:'My notes'}});
 fireEvent.click(screen.getByRole('button',{name:'Generate radiology draft'}));
 expect(await screen.findByLabelText('Generated radiology draft')).toHaveValue('Generated radiology findings');
 expect(screen.getByLabelText('Review and edit the notes')).toHaveValue('My notes');expect(api.write).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Use generated draft'}));
 expect(screen.getByLabelText('Review and edit the notes')).toHaveValue('Generated radiology findings');
 expect(screen.getByRole('button',{name:'Copy reviewed notes'})).toBeDisabled();expect(api.write).not.toHaveBeenCalled();
});
it('rejects a changed saved chart after generation rather than using stale text',async()=>{
 const api=backend();const source=(await api.context()).source;
 api.context.mockResolvedValueOnce({source,drafts:[]}).mockResolvedValueOnce({source,drafts:[]}).mockResolvedValueOnce({source:{...source,hash:'b'.repeat(64)},drafts:[]});
 render(<PimsDrafts chartId="chart" backend={api} aiEnabled/>);await open();
 fireEvent.click(screen.getByRole('button',{name:'Generate radiology draft'}));
 await screen.findByRole('alert');expect(screen.queryByLabelText('Generated radiology draft')).not.toBeInTheDocument();
});
it('suppresses generated text after the selected chart changes',async()=>{
 let done!:(text:string)=>void;mocks.generate.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
 const api=backend();const view=render(<PimsDrafts chartId="chart" backend={api} aiEnabled/>);await open();
 fireEvent.click(screen.getByRole('button',{name:'Generate radiology draft'}));await waitFor(()=>expect(mocks.generate).toHaveBeenCalledOnce());
 view.rerender(<PimsDrafts chartId="other" backend={api} aiEnabled/>);await act(async()=>done('Stale generated findings'));
 expect(screen.queryByLabelText('Generated radiology draft')).not.toBeInTheDocument();
});
it('requires AI access and radiology type to offer generation',async()=>{
 render(<PimsDrafts chartId="chart" backend={backend()}/>);await open();expect(screen.queryByRole('button',{name:'Generate radiology draft'})).not.toBeInTheDocument();
});

it('keeps existing notes editable and generation retryable after a transient AI failure',async()=>{
 mocks.generate.mockRejectedValueOnce(new TypeError());const api=backend();
 render(<PimsDrafts chartId="chart" backend={api} aiEnabled/>);await open();
 fireEvent.change(screen.getByLabelText('Review and edit the notes'),{target:{value:'My notes'}});
 fireEvent.click(screen.getByRole('button',{name:'Generate radiology draft'}));await screen.findByRole('alert');
 expect(screen.getByLabelText('Review and edit the notes')).toHaveValue('My notes');
 expect(screen.getByRole('button',{name:'Save draft'})).toBeEnabled();
 expect(screen.getByRole('button',{name:'Generate radiology draft'})).toBeEnabled();expect(api.write).not.toHaveBeenCalled();
});
