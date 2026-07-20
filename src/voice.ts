/*
 * Ecology Coach
 * Copyright © 2026 Dr. Tahir Ali
 * All rights reserved. See LICENSE.
 */

export type VoicePreferences={enabled:boolean;autoRead:boolean;readFeedback:boolean;rate:"slow"|"normal";voiceURI:string};type RC=new()=>SpeechRecognition;type Options={onInterim:(s:string)=>void;onFinal:(s:string)=>void;onError:(s:string)=>void;onEnd:()=>void};const KEY="ecology-coach-voice";const LANG="de-DE";const blocked=["grandma","grandpa","eddy","flo","rocko","sandy","shelley"];let current:SpeechSynthesisUtterance|null=null;let status={speaking:false,speechId:null as string|null};const listeners=new Set<()=>void>();const publish=(s:typeof status)=>{status=s;listeners.forEach(x=>x())};export const getSpeechStatus=()=>status;export const subscribeSpeechStatus=(x:()=>void)=>{listeners.add(x);return()=>listeners.delete(x)};const defaults:VoicePreferences={enabled:true,autoRead:false,readFeedback:false,rate:"normal",voiceURI:""};export function loadVoicePreferences(){try{return{...defaults,...JSON.parse(localStorage.getItem(KEY)??"{}")}}catch{return defaults}}export function saveVoicePreferences(v:VoicePreferences){localStorage.setItem(KEY,JSON.stringify(v))}export function getVoices(){return speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith(LANG.slice(0,2).toLowerCase())&&!blocked.some(x=>v.name.toLowerCase().includes(x))).sort((a,b)=>Number(b.localService)-Number(a.localService))}function pick(v:SpeechSynthesisVoice[],uri:string){return v.find(x=>x.voiceURI===uri)??v.find(x=>x.name.toLowerCase().includes("anna"))??v.find(x=>x.default)??v[0]}export async function speakText(text:unknown,p:VoicePreferences,speechId="default"){const t=typeof text==="string"?text.trim():"";if(!p.enabled||!t)return;if(status.speaking&&status.speechId===speechId){stopSpeaking();return}if(current||speechSynthesis.speaking||speechSynthesis.pending)stopSpeaking();let voices=getVoices();if(!voices.length)await new Promise<void>(r=>{const f=()=>{speechSynthesis.removeEventListener("voiceschanged",f);r()};speechSynthesis.addEventListener("voiceschanged",f);setTimeout(f,1200)});voices=getVoices();const u=new SpeechSynthesisUtterance(t),voice=pick(voices,p.voiceURI);current=u;u.lang=voice?.lang??LANG;u.voice=voice??null;u.rate=p.rate==="slow"?.78:.96;u.onstart=()=>publish({speaking:true,speechId});u.onend=()=>{if(current===u)current=null;publish({speaking:false,speechId:null})};u.onerror=e=>{if(current===u)current=null;publish({speaking:false,speechId:null});if(!["canceled","interrupted"].includes(e.error))console.error(e.error)};speechSynthesis.speak(u)}export function stopSpeaking(){current=null;publish({speaking:false,speechId:null});speechSynthesis?.cancel()}function ctor():RC|undefined{const w=window as any;return w.SpeechRecognition??w.webkitSpeechRecognition}export const speechRecognitionSupported=()=>Boolean(ctor());export function createRecognition(o:Options){const C=ctor();if(!C)return null;const r=new C();r.lang=LANG;r.continuous=false;r.interimResults=true;r.maxAlternatives=1;r.onresult=(e:SpeechRecognitionEvent)=>{let i="",f="";for(let n=e.resultIndex;n<e.results.length;n++){const t=e.results[n][0]?.transcript??"";e.results[n].isFinal?f+=t:i+=t}o.onInterim(i.trim());if(f.trim())o.onFinal(f.trim())};r.onerror=(e:SpeechRecognitionErrorEvent)=>o.onError(e.error);r.onend=o.onEnd;return r}

/**
 * Compatibility wrapper for lesson components.
 * Uses the existing speech engine and preferences.
 */
export async function speakGerman(
  text: string,
  preferences: VoicePreferences
): Promise<void> {
  await speakText(
    text,
    preferences,
    "lesson-detail"
  );
}
