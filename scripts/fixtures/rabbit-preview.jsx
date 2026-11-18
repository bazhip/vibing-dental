// Local fixture: actual chart components, no backend/account required.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PatientForm} from '/src/components/PatientForm.tsx';
import {DiagramView} from '/src/components/DiagramView.tsx';
import {EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS} from '/src/types/index.ts';
import i18n, {loadLanguage} from '/src/i18n/index.ts';
import '/src/index.css';
import '/src/styles/themes.css';
import '/src/components/EntryGrid.css';
import '/src/components/ClinicalPolish.css';
import '/src/ios/tokens.css';
import '/src/ios/ios.css';
import '/src/ios/sheets.css';
import '/src/ios/Form.css';
import {initNativeShell} from '/src/native/platform.ts';
initNativeShell();
const h=React.createElement;
const params=new URLSearchParams(location.search);
if(params.has('native')) document.documentElement.classList.add('native-ios');
window.setLanguage=async lng=>{await loadLanguage(lng);await i18n.changeLanguage(lng);document.documentElement.lang=lng;};
function Preview(){
 const [species,setSpecies]=React.useState('rabbit');
 const [patient,setPatient]=React.useState({patientName:params.has('empty')?'':'Professor Bartholomew Thistlewhisker the Third',patientNumber:'R-028',ownerName:'Alexandra Montgomery-Wellington',ownerPhone:'',ownerEmail:'',doctor:'',tech:'',date:'2026-11-18',complaint:'',treatmentReport:'',recallDate:'',exam:EMPTY_EXAM_FINDINGS,nerveBlocks:EMPTY_NERVE_BLOCKS});
 const [marks,setMarks]=React.useState(params.has('empty')?{}:{106:'missing',409:'extracted'});
 const [comments,setComments]=React.useState(params.has('empty')?[]:[{id:'c1',text:'Elongated crown, buccal spur',anchorTriadan:108}]);
 const [strokes,setStrokes]=React.useState([]);
 return h('main',{className:'entry-grid-container',style:{maxWidth:'1200px',paddingTop:'24px'}},
 h('div',{className:'entry-grid-form'},
 h(PatientForm,{patientInfo:patient,species,onPatientInfoChange:(field,value)=>setPatient(p=>({...p,[field]:value})),onSpeciesChange:setSpecies}),
 h(DiagramView,{title:'Diagnosis',species,toothMarks:marks,onToothMarksChange:setMarks,comments,onCommentsChange:setComments,strokes,onStrokesChange:setStrokes,markMode:'missing-only'})));
}
createRoot(document.getElementById('root')).render(h(Preview));
