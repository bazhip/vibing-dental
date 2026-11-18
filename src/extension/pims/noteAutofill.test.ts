import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createNoteAutofill, identifyNoteProvider, isNoteAutofillRequest, isNoteAutofillResult } from './noteAutofill';
import type { AdapterContext } from './types';
const storage = (): Storage => { const data = new Map<string,string>(); return { get length(){return data.size;}, clear:()=>data.clear(),getItem:key=>data.get(key)??null,key:index=>[...data.keys()][index]??null,removeItem:key=>{data.delete(key);},setItem:(key,value)=>{data.set(key,value);} }; };
let taskLocal: Storage, taskSession: Storage;

function fixture(provider: 'pulse'|'rhapsody'|'vetspire' = 'vetspire') {
 document.body.innerHTML = provider==='vetspire' ? '<div id="sectionContainer"><div id="Assessment"><div class="ql-editor" contenteditable="true"><p>Existing note</p></div></div></div>'
  : provider==='pulse' ? '<input name="__RequestVerificationToken" value="csrf"><medical-record-question-section><span class="ds-text-h4">Assessment</span><div contenteditable="true"><p>Existing note</p></div></medical-record-question-section>'
  : '<button role="tab" aria-selected="true">Medical notes</button><button role="tab" aria-selected="false">Discharge notes</button><div class="ck-editor__editable" contenteditable="true"><p>Existing note</p></div>';
 const url=new URL(provider==='vetspire'?'https://clinic.vetspire.com/notes':provider==='pulse'?'https://clinic.evetpractice.com/notes':'https://clinic.rhapsody.vet/notes?businessId=business');
 let current=url;taskLocal.setItem('authToken','token');taskLocal.setItem('__pref-location','location');document.cookie='JWT=token; path=/';
 const ctx:AdapterContext={doc:document,url,currentUrl:()=>current,localStorage:taskLocal,sessionStorage:taskSession,fetch:vi.fn(),wait:async()=>{}};
 const editor=document.querySelector<HTMLElement>('[contenteditable="true"]')!;
 const api={state:'ready',data:{processor:{toView:vi.fn((html:string)=>html)},toModel:vi.fn((html:string)=>html)},model:{document:{getRoot:()=>editor,selection:{}},change:vi.fn((callback:(writer:unknown)=>void)=>callback({setSelection:()=>{},createPositionAt:()=>({})})),insertContent:vi.fn((html:string)=>{editor.innerHTML += html;})}};
 if(provider==='rhapsody')Object.assign(editor,{ckeditorInstance:api});
 return {ctx,editor,api,helper:createNoteAutofill(ctx),navigate:(value:string)=>{current=new URL(value);}};
}
beforeEach(()=>{document.body.innerHTML='';taskLocal=storage();taskSession=storage();});
afterEach(()=>{vi.restoreAllMocks();document.cookie='JWT=; Max-Age=0; path=/';});
it.each(['vetspire','pulse','rhapsody'] as const)('appends escaped text to the open %s editor exactly once without saving',async provider=>{
 const {helper,editor,api}=fixture(provider);const field=provider==='rhapsody'?'Medical notes':'Assessment';
 const inspected=await helper.execute({operation:'inspect'});expect(inspected).toMatchObject({state:'fields',provider,fields:[field]});
 const ready=await helper.execute({operation:'prepare',field});expect(ready.state).toBe('prepared');if(ready.state!=='prepared')return;
 const result=await helper.execute({operation:'fill',ticket:ready.ticket,text:'409: possible resorption <uncertain>.'});expect(result).toEqual({state:'filled'});
 expect(editor.textContent).toContain('Existing note');expect(editor.textContent).toContain('409: possible resorption <uncertain>.');expect(editor.querySelector('uncertain')).toBeNull();
 expect(await helper.execute({operation:'fill',ticket:ready.ticket,text:'repeat'})).toEqual({state:'blocked'});
 if(provider==='rhapsody')expect(api.model.insertContent).toHaveBeenCalledOnce();helper.dispose();
});
it.each(['url','session','editor','field','content','locked','navigation','expired'] as const)('blocks a prepared field after %s changes',async mode=>{
 const {helper,editor,navigate}=fixture();const ready=await helper.execute({operation:'prepare',field:'Assessment'});if(ready.state!=='prepared')throw new TypeError();
 if(mode==='url')navigate('https://clinic.vetspire.com/other');
 if(mode==='session')taskLocal.setItem('authToken','other');
 if(mode==='editor')editor.replaceWith(editor.cloneNode(true));
 if(mode==='field')document.getElementById('Assessment')!.id='Different';
 if(mode==='content')editor.innerHTML='<p>Edited concurrently</p>';
 if(mode==='locked')editor.setAttribute('contenteditable','false');
 if(mode==='navigation')window.dispatchEvent(new Event('hashchange'));
 if(mode==='expired')vi.spyOn(Date,'now').mockReturnValue(Date.parse(ready.expires_at));
 const old=document.body.innerHTML;expect(await helper.execute({operation:'fill',ticket:ready.ticket,text:'New text'})).toEqual({state:'blocked'});expect(document.body.innerHTML).toBe(old);helper.dispose();
});
it('returns unknown without replay when a provider input handler changes destination during mutation',async()=>{
 const {helper,editor,navigate}=fixture();const ready=await helper.execute({operation:'prepare',field:'Assessment'});if(ready.state!=='prepared')throw new TypeError();
 editor.addEventListener('input',()=>navigate('https://clinic.vetspire.com/other'),{once:true});
 expect(await helper.execute({operation:'fill',ticket:ready.ticket,text:'New text'})).toEqual({state:'unknown'});expect(editor.textContent).toContain('New text');helper.dispose();
});
it.each(['duplicate','hidden','readonly','missingSession'] as const)('does not offer ambiguous or unavailable fields: %s',async mode=>{
 const {ctx,helper,editor}=fixture();if(mode==='duplicate')editor.parentElement!.appendChild(editor.cloneNode(true));
 if(mode==='hidden')editor.style.visibility='hidden';if(mode==='readonly')editor.setAttribute('aria-readonly','true');if(mode==='missingSession')taskLocal.clear();
 expect(await helper.execute({operation:'prepare',field:'Assessment'})).toEqual({state:'blocked'});expect(ctx.fetch).not.toHaveBeenCalled();helper.dispose();
});
it('invalidates a source permanently after an observed token switch even if restored',async()=>{
 const {helper}=fixture();taskLocal.setItem('authToken','changed');expect(await helper.execute({operation:'inspect'})).toEqual({state:'blocked'});taskLocal.setItem('authToken','token');expect(await helper.execute({operation:'inspect'})).toEqual({state:'blocked'});helper.dispose();
});
it('requires the selected Rhapsody tab and a ready CKEditor model',async()=>{
 const {helper,api}=fixture('rhapsody');api.state='initializing';expect(await helper.execute({operation:'prepare',field:'Medical notes'})).toEqual({state:'blocked'});api.state='ready';
 expect(await helper.execute({operation:'prepare',field:'Discharge notes'})).toEqual({state:'blocked'});helper.dispose();
});
it('supports the evidenced TinyMCE API on an already-open Pulse legacy editor',async()=>{
 const {ctx,helper}=fixture('pulse');helper.dispose();document.body.innerHTML='<input name="__RequestVerificationToken" value="csrf"><fieldset><legend>Assessment</legend><ol><li><div class="mce-tinymce"><div class="mce-edit-area"><iframe id="note_ifr"></iframe></div></div></li></ol></fieldset>';
 const iframe=document.querySelector('iframe')!;const body=iframe.contentDocument!.body;body.setAttribute('contenteditable','true');body.innerHTML='<p>Existing note</p>';
 const api={focus:vi.fn(),getBody:()=>body,getContent:()=>body.innerHTML,selection:{select:vi.fn(),collapse:vi.fn()},insertContent:vi.fn((html:string)=>{body.innerHTML+=html;}),setDirty:vi.fn()};
 Object.assign(window,{tinymce:{get:(id:string)=>id==='note'?api:null}});const writer=createNoteAutofill(ctx);const prepared=await writer.execute({operation:'prepare',field:'Assessment'});expect(prepared.state).toBe('prepared');if(prepared.state!=='prepared')return;
 expect(await writer.execute({operation:'fill',ticket:prepared.ticket,text:'Documented 409 finding'})).toEqual({state:'filled'});expect(api.insertContent).toHaveBeenCalledOnce();expect(api.setDirty).toHaveBeenCalledWith(true);expect(body.textContent).toContain('Existing note');writer.dispose();delete (window as Window&{tinymce?:unknown}).tinymce;
});
it('rejects unrelated hosts, malformed requests and prepared-result mismatches',()=>{
 expect(identifyNoteProvider('https://vetspire.com.attacker.test/')).toBeNull();expect(identifyNoteProvider('http://clinic.vetspire.com/')).toBeNull();expect(identifyNoteProvider('https://clinic.vetspire.com:444/')).toBeNull();
 expect(isNoteAutofillRequest({operation:'fill',ticket:'a',text:'x\u0000y'})).toBe(false);expect(isNoteAutofillRequest({operation:'prepare',field:''})).toBe(false);
 expect(isNoteAutofillResult({state:'fields',provider:'pulse',origin:'https://clinic.vetspire.com',title:'Note',fields:['Assessment']})).toBe(false);
});
it('rejects fabricated providers even when the origin is also unsupported',()=>{
 expect(isNoteAutofillResult({state:'fields',provider:null,origin:'https://attacker.test',title:'Notes',fields:['Assessment']})).toBe(false);
});
it.each(['event','settle'] as const)('reports unknown if ticket expires during %s after insertion',async timing=>{
 const {ctx,helper,editor}=fixture();const prepared=await helper.execute({operation:'prepare',field:'Assessment'});if(prepared.state!=='prepared')throw new TypeError();
 const expire=()=>vi.spyOn(Date,'now').mockReturnValue(Date.parse(prepared.expires_at));
 if(timing==='event')editor.addEventListener('input',expire,{once:true});else ctx.wait=async()=>{expire();};
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'New documented finding'})).toEqual({state:'unknown'});helper.dispose();
});
it('offers only the active Pulse sidebar, preserving background fields',async()=>{
 const {helper,editor}=fixture('pulse');document.body.insertAdjacentHTML('beforeend','<div role="complementary" class="p-sidebar-active"><div class="covetrus-sidebar-header-title"> Discharge   summary </div><div contenteditable="true">Sidebar existing</div></div>');
 expect(await helper.execute({operation:'inspect'})).toMatchObject({fields:['Discharge summary']});
 expect(await helper.execute({operation:'prepare',field:'Assessment'})).toEqual({state:'blocked'});
 const prepared=await helper.execute({operation:'prepare',field:'Discharge summary'});if(prepared.state!=='prepared')throw new TypeError();
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'Home care discussed'})).toEqual({state:'filled'});expect(editor.textContent).toBe('Existing note');helper.dispose();
});
it('blocks oversized appends before mutation',async()=>{
 const {helper,editor}=fixture();const prepared=await helper.execute({operation:'prepare',field:'Assessment'});if(prepared.state!=='prepared')throw new TypeError();
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'x'.repeat(60000)})).toEqual({state:'blocked'});expect(editor.textContent).toBe('Existing note');helper.dispose();
});
it('reports a non-appending framework result as unknown',async()=>{
 const {helper,editor,api}=fixture('rhapsody');const prepared=await helper.execute({operation:'prepare',field:'Medical notes'});if(prepared.state!=='prepared')throw new TypeError();
 api.model.insertContent.mockImplementation(()=>{editor.innerHTML='Replacement';});
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'New note'})).toEqual({state:'unknown'});helper.dispose();
});
it('never creates or saves a Vetspire field that is not already open',async()=>{
 const {helper}=fixture();document.getElementById('Assessment')!.innerHTML='<div><i class="material-icons">add</i>Add Note</div>';
 const click=vi.fn();document.body.addEventListener('click',click,{once:true});
 expect(await helper.execute({operation:'prepare',field:'Assessment'})).toEqual({state:'blocked'});expect(click).not.toHaveBeenCalled();helper.dispose();
});
it('notifies Pulse using the captured Space/Backspace event sequence',async()=>{
 const {helper,editor}=fixture('pulse');const keys:string[]=[];
 for(const type of ['keydown','keypress','keyup'])editor.addEventListener(type,event=>keys.push(type+':'+(event as KeyboardEvent).key));
 const prepared=await helper.execute({operation:'prepare',field:'Assessment'});if(prepared.state!=='prepared')throw new TypeError();
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'New finding'})).toEqual({state:'filled'});
 expect(keys).toEqual(['keydown: ','keypress: ','keyup: ','keydown:Backspace','keyup:Backspace']);helper.dispose();
});
it('stops Pulse keyboard notifications immediately if their handler changes the destination',async()=>{
 const {helper,editor,navigate}=fixture('pulse');const press=vi.fn();editor.addEventListener('keypress',press);
 editor.addEventListener('keydown',()=>navigate('https://clinic.evetpractice.com/other'),{once:true});
 const prepared=await helper.execute({operation:'prepare',field:'Assessment'});if(prepared.state!=='prepared')throw new TypeError();
 expect(await helper.execute({operation:'fill',ticket:prepared.ticket,text:'New finding'})).toEqual({state:'unknown'});expect(press).not.toHaveBeenCalled();helper.dispose();
});
