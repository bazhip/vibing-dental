// Local preview of the shared toolbar; no backend or account is required.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {DiagramView} from '/src/components/DiagramView.tsx';
import i18n, {loadLanguage} from '/src/i18n/index.ts';
import '/src/index.css';
import '/src/styles/themes.css';
import '/src/components/EntryGrid.css';
const h = React.createElement;
window.setLanguage = async lng => { await loadLanguage(lng); await i18n.changeLanguage(lng); document.documentElement.lang=lng; };
function Diagram({title, markMode}) {
 const [marks,setMarks] = React.useState({});
 const [comments,setComments] = React.useState([]);
 const [strokes,setStrokes] = React.useState([]);
 return h(DiagramView,{title,markMode,species:'canine',toothMarks:marks,onToothMarksChange:setMarks,comments,onCommentsChange:setComments,strokes,onStrokesChange:setStrokes,readOnly:new URLSearchParams(location.search).has('locked')});
}
function Preview() {
 return h('main',{style:{padding:'16px',maxWidth:'1600px',margin:'auto',display:'grid',gap:'32px'}},
 h(Diagram,{title:'Diagnosis',markMode:'missing-only'}),h(Diagram,{title:'Procedure',markMode:'extracted-only'}));
}
createRoot(document.getElementById('root')).render(h(Preview));
