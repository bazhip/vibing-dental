// Real directory/history components; only backend hooks are mocked by the browser check.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import '/src/index.css';import '/src/styles/themes.css';import '/src/styles/boards.css';import '/src/components/EntryGrid.css';import '/src/components/Workspace.css';import '/src/components/DialogPolish.css';
import {ChartLibrary} from '/src/components/ChartLibrary.tsx';
import {ChartHistoryModal} from '/src/components/ChartHistoryModal.tsx';
import i18n,{loadLanguage} from '/src/i18n/index.ts';
const h=React.createElement,params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get('theme')||'dark';
window.setLanguage=async lng=>{await loadLanguage(lng);await i18n.changeLanguage(lng);};
const row=(id,name,number,date)=>({id,patient_name:name,patient_number:number,owner_name:id==='a1'?'Jordan Ellis':'Alexandra Montgomery-Wellington',owner_phone:id==='a1'?'555-0101':'555-0182',owner_email:id==='a1'?'jordan@clinic.test':'alex@example.test',species:'canine',dentition:'permanent',chart_date:date,recall_date:'',updated_at:date+'T12:00:00Z',created_by:'u1'});
const rows=params.has('empty')?[]:[row('a1','Professor Bartholomew Thistlewhisker the Third','123','2026-11-18'),row('b1','Fluffy','666','2026-11-18'),row('b2','Fluffy','666','2026-10-12'),...Array.from({length:12},(_,i)=>row('p'+i,'Patient '+i,'P'+i,'2026-11-17'))];
function Preview(){
 const [history,setHistory]=React.useState(params.has('history-first')?{id:'a1',label:'Professor Bartholomew'}:null),[closed,setClosed]=React.useState(false);
 return h(React.Fragment,null,
 h('div',{className:'entry-grid-container'},h('header',{className:'entry-grid__topbar'},h('button',{className:'voice-input'},'Dictate'),h('button',{className:'voice-input',disabled:true},'Unavailable')),h('aside',{className:'workspace-sidebar__account'},h('button',{className:'chart-menu__trigger'},'alex@example.test'))),
 history&&h(ChartHistoryModal,{chartId:history.id,label:history.label,onClose:()=>setHistory(null)}),
 !closed&&createPortal(h(ChartLibrary,{listCharts:async q=>{window.lastDirectoryQuery=q;return{rows:rows.filter(r=>!q?.search||[r.patient_name,r.patient_number,r.owner_name,r.owner_phone,r.owner_email].some(v=>v.toLowerCase().includes(q.search.toLowerCase()))),hasMore:false};},onOpen:async()=>true,onDelete:async()=>{},onNewVisit:()=>{},onSendReminder:()=>{},onClearRecalls:async()=>{},onNewPatient:()=>{},onLoadPdf:async()=>false,onClose:()=>setClosed(true),onOpenHistory:(id,label)=>{window.historyClicks=(window.historyClicks||0)+1;setHistory({id,label});}}),document.body));
}
if(params.has('app')) { const {default:EntryGrid}=await import('/src/EntryGrid.tsx'); createRoot(document.getElementById('root')).render(h(EntryGrid,{trial:true})); } else createRoot(document.getElementById('root')).render(h(Preview));
