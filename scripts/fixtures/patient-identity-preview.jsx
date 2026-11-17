// Local-only browser fixture for verify-patient-identity.cjs. Backend is mocked by Playwright.
import React from 'react';
import ReactDOM from 'react-dom/client';
import {useCloudSync} from '/src/hooks/useCloudSync.ts';
import {DialogHost} from '/src/components/ui/dialogs.tsx';
import i18n, {loadLanguage} from '/src/i18n/index.ts';
import '/src/index.css';
import '/src/styles/themes.css';
import '/src/ios/tokens.css';
window.setLanguage = async lng => { await loadLanguage(lng); await i18n.changeLanguage(lng); };
const h=React.createElement;
function Fixture() {
 const [name,setName]=React.useState('Luffy');
 const [number,setNumber]=React.useState('SP0001');
 const snapshot=React.useMemo(()=>({species:'canine',toothData:[],patientInfo:{patientName:name,patientNumber:number,date:'2026-11-16',ownerName:'',ownerPhone:'',ownerEmail:'',complaint:'',treatmentReport:'',nerveBlocks:{},exam:{}}}),[name,number]);
 const cloud=useCloudSync({getSnapshot:()=>snapshot,cloudChartId:'saved-chart',openedExisting:true,applySnapshot:()=>{},resetCloudChartId:()=>{},setOpenedExisting:()=>{}},name!=='Luffy'||number!=='SP0001','practice',true);
 window.fixture={cloud,setName,setNumber};
 return h(React.Fragment,null,h('main',{style:{padding:'24px'}},h('h1',null,'Patient chart'),h('label',null,'Patient name',h('input',{'aria-label':'Patient name',value:name,onChange:e=>setName(e.target.value)})),h('label',null,'Patient number',h('input',{'aria-label':'Patient number',value:number,onChange:e=>setNumber(e.target.value)})),h('button',{onClick:()=>cloud.saveNow().catch(()=>{})},'Save'),h('p',{role:'status'},cloud.saveError)),h(DialogHost));
}
(window.identityRoot ??= ReactDOM.createRoot(document.getElementById('root'))).render(h(Fixture));
