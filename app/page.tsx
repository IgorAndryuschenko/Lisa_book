"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Feather, Mic, Pause, Play, Plus, Save, Square, Trash2, X, PawPrint } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ru } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { transcribeLocally } from "./local-transcribe";
import WritingBoard from "./writing-board";

type Entry = { id: string; date: string; time: string; kind: "text"|"voice"; text: string; transcript?: string; audioId?: string; duration?: number; sticker?: string };
type Todo = {id: string; date: string; text: string; done: boolean};
type LegacyTodo = Omit<Todo,"date"> & {date?:string};
const sample: Entry[] = [
  {id:"example-1",date:"2026-09-24",time:"09:18",kind:"text",text:"Сегодня в лесу было тихо. Нашла хорошую мысль для новой главы."},
  {id:"example-2",date:"2026-09-24",time:"18:42",kind:"voice",text:"",transcript:"Запомнить запах хвои после дождя. Возможно, это начало рассказа.",duration:84},
];
const sampleTodos: LegacyTodo[] = [
  {id:"t1",text:"Утренняя прогулка в лесу",done:true},{id:"t2",text:"Написать в дневник",done:true},
  {id:"t3",text:"Разобрать фото с поездки",done:false},{id:"t4",text:"Прочитать 20 страниц",done:false},
];
const names = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const titles = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const days = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
const emoji = ["😊","😌","🥰","😂","😇","😴","😍","😮","😔","🤔","❤️","✨","😁","😉","😜","😭","🌙","🍂"];
const dateKey = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const pretty = (key:string) => {const [y,m,d]=key.split("-").map(Number);return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric"}).format(new Date(y,m-1,d)).replace(" г.","");};
const stored = <T,>(key:string,fallback:T):T => {try {const data=localStorage.getItem(key);return data?JSON.parse(data) as T:fallback;}catch{return fallback;}};
const newId = ():string => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const timeFormat = (n=0) => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
async function apiError(response:Response,fallback:string){try{return ((await response.json()) as {error?:string}).error??fallback;}catch{return fallback;}}
async function writeDiary(payload: unknown) {
  const response = await fetch("/api/diary", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!response.ok) throw new Error(await apiError(response,"Не удалось сохранить данные"));
}
function audioDB():Promise<IDBDatabase>{return new Promise((ok,bad)=>{const r=indexedDB.open("fox-audio",1);r.onupgradeneeded=()=>r.result.createObjectStore("files");r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
async function getAudio(id:string):Promise<Blob|undefined>{const db=await audioDB();const result=await new Promise<Blob|undefined>((ok,bad)=>{const r=db.transaction("files").objectStore("files").get(id);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});db.close();return result;}
function StickerVisual({value}:{value:string}){if(value.startsWith("/stickers/")){const index=Number(value.match(/sticker-(\d+)/)?.[1]??1)-1;return <span className="sticker-sprite" style={{backgroundPosition:`${(index%4)*100/3}% ${Math.floor(index/4)*50}%`}}/>;}if(value.startsWith("data:")||value.startsWith("/api/stickers/"))return <img src={value} alt="Стикер"/>;return <span>{value}</span>;}

export default function HomePage(){
  const today=useMemo(()=>new Date(),[]);
  const [month,setMonth]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const [selected,setSelected]=useState<string|null>(null);
  const [taskDate,setTaskDate]=useState(dateKey(today));
  const [taskCalendarOpen,setTaskCalendarOpen]=useState(false);
  const [editorDate,setEditorDate]=useState(dateKey(today));
  const [page,setPage]=useState<"calendar"|"editor">("calendar");
  const [section,setSection]=useState<"diary"|"writing">("diary");
  const [tasksOpen,setTasksOpen]=useState(true);
  const [tab,setTab]=useState<"stickers"|"emoji">("stickers");
  const [mode,setMode]=useState<"text"|"voice">("text");
  const [entries,setEntries]=useState<Entry[]>([]);
  const [todos,setTodos]=useState<Todo[]>([]);
  const [stickers,setStickers]=useState<string[]>([]);
  const [storageError,setStorageError]=useState("");
  const [loading,setLoading]=useState(true);
  const [localPending,setLocalPending]=useState<{entries:Entry[];todos:LegacyTodo[];stickers:string[]}|null>(null);
  const [importing,setImporting]=useState(false);
  const [text,setText]=useState("");
  const [attached,setAttached]=useState<string|undefined>();
  const [editId,setEditId]=useState<string|null>(null);
  const [todoText,setTodoText]=useState("");
  const [addingTodo,setAddingTodo]=useState(false);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [audioUrls,setAudioUrls]=useState<Record<string,string>>({});
  const [recording,setRecording]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [blob,setBlob]=useState<Blob|null>(null);
  const [transcript,setTranscript]=useState("");
  const [transcribing,setTranscribing]=useState(false);
  const [modelStatus,setModelStatus]=useState("");
  const [notice,setNotice]=useState("");
  const recorder=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const start=useRef(0);
  const fileInput=useRef<HTMLInputElement>(null);
  const textarea=useRef<HTMLTextAreaElement>(null);
  const loadServer = async () => {
    try {
      const response=await fetch("/api/diary",{cache:"no-store"});
      if(!response.ok) throw new Error(await apiError(response,"Хранилище недоступно"));
      const data=await response.json() as {entries:Entry[];todos:Todo[];stickers:string[]};
      setEntries(data.entries);setTodos(data.todos);setStickers(data.stickers);setStorageError("");
    } catch(error) {setStorageError(error instanceof Error?error.message:"Хранилище недоступно");}
    finally {setLoading(false);}
  };
  useEffect(()=>{
    void loadServer();
    if(!localStorage.getItem("fox-cloud-imported-v1")) {
      const oldEntries=stored("fox-entries",sample).filter(e=>!e.id.startsWith("example-"));
      const oldTodos=stored("fox-todos",sampleTodos).filter(t=>!/^t[1-4]$/.test(t.id));
      const oldStickers=stored<string[]>("fox-stickers",[]);
      if(oldEntries.length||oldTodos.length||oldStickers.length) setLocalPending({entries:oldEntries,todos:oldTodos,stickers:oldStickers});
    }
  },[]);
  const uploadStickerFile = async(file:Blob,name="sticker.png") => {
    const form=new FormData();form.append("file",file,name);
    const response=await fetch("/api/stickers",{method:"POST",body:form});
    if(!response.ok) throw new Error(await apiError(response,"Не удалось сохранить стикер"));
    return (await response.json() as {url:string}).url;
  };
  const importLocal = async() => {
    if(!localPending)return;
    setImporting(true);
    try {
      const converted=new Map<string,string>();
      for(const source of localPending.stickers){
        if(!source.startsWith("data:"))continue;
        const uploaded=await uploadStickerFile(await (await fetch(source)).blob());
        converted.set(source,uploaded);
      }
      for(const entry of localPending.entries){
        const audio=entry.audioId?await getAudio(entry.audioId):undefined;
        if(audio){const response=await fetch(`/api/audio/${entry.id}`,{method:"PUT",headers:{"Content-Type":audio.type||"audio/webm"},body:audio});if(!response.ok)throw new Error("Не удалось перенести аудио");}
        await writeDiary({op:"entry-upsert",entry:{...entry,audioId:audio?entry.id:undefined,sticker:entry.sticker?converted.get(entry.sticker)??entry.sticker:undefined}});
      }
      for(const todo of localPending.todos)await writeDiary({op:"todo-upsert",todo:{...todo,date:todo.date??dateKey(today)}});
      localStorage.setItem("fox-cloud-imported-v1","yes");
      setLocalPending(null);
      await loadServer();setNotice("Записи перенесены. Копия в браузере сохранена.");
    }catch(error){setNotice(error instanceof Error?error.message:"Перенос прервался. Можно повторить.");}
    finally{setImporting(false);}
  };
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start.current)/1000)),250);return()=>clearInterval(timer);},[recording]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(timer);},[notice]);
  const chosen=page==="editor"?editorDate:(selected??dateKey(today));
  const dayEntries=entries.filter(e=>e.date===chosen).sort((a,b)=>a.time.localeCompare(b.time));
  const dayTodos=todos.filter(todo=>todo.date===taskDate);
  const selectedTaskDate=useMemo(()=>{const [year,number,day]=taskDate.split("-").map(Number);return new Date(year,number-1,day);},[taskDate]);
  const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
  const monthLength=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const cells=Array.from({length:Math.ceil((offset+monthLength)/7)*7},(_,i)=>i-offset+1);
  const showDate=(date:string,openEntries=false)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const [year,number]=date.split("-").map(Number);setMonth(new Date(year,number-1,1));setTaskDate(date);setTaskCalendarOpen(false);setSelected(openEntries?date:null);setAddingTodo(false);setTodoText("");};
  const changeMonth=(n:number)=>showDate(dateKey(new Date(month.getFullYear(),month.getMonth()+n,1)));
  const openEditor=(date:string,entry?:Entry)=>{setTaskDate(date);setEditorDate(date);setSelected(null);setEditId(entry?.id??null);setMode(entry?.kind??"text");setTab(entry?.kind==="voice"?"emoji":"stickers");setText(entry?.text??"");setAttached(entry?.sticker);setTranscript(entry?.transcript??"");setSeconds(entry?.duration??0);setBlob(null);setPage("editor");};
  const goBack=()=>{if(recording)recorder.current?.stop();setPage("calendar");setSelected(null);setEditId(null);};
  const addTodo=async()=>{if(!todoText.trim())return;const todo:Todo={id:newId(),date:taskDate,text:todoText.trim(),done:false};try{await writeDiary({op:"todo-upsert",todo});setTodos(p=>[...p,todo]);setTodoText("");setAddingTodo(false);}catch(error){setNotice(error instanceof Error?error.message:"Не удалось сохранить дело");}};
  const toggleTodo=async(todo:Todo)=>{try{const changed={...todo,done:!todo.done};await writeDiary({op:"todo-upsert",todo:changed});setTodos(p=>p.map(t=>t.id===todo.id?changed:t));}catch(error){setNotice(error instanceof Error?error.message:"Не удалось изменить дело");}};
  const deleteTodo=async(todo:Todo)=>{try{await writeDiary({op:"todo-delete",id:todo.id});setTodos(p=>p.filter(t=>t.id!==todo.id));}catch(error){setNotice(error instanceof Error?error.message:"Не удалось удалить дело");}};
  const insertEmoji=(value:string)=>{if(page==="editor"&&mode==="text"){const at=textarea.current?.selectionStart??text.length;setText(s=>s.slice(0,at)+value+s.slice(at));requestAnimationFrame(()=>textarea.current?.focus());}else navigator.clipboard?.writeText(value).then(()=>setNotice("Скопировано"));};
  const addSticker=(value:string)=>{if(page!=="editor"){openEditor(dateKey(today));setAttached(value);}else if(mode!=="text"){setMode("text");setAttached(value);}else setAttached(value);setNotice("Стикер добавлен в запись");};
  const upload=async(file?:File)=>{if(!file)return;if(!file.type.startsWith("image/")||file.size>600000){setNotice("Нужно изображение размером до 600 КБ.");return;}try{const url=await uploadStickerFile(file,file.name);setStickers(p=>[...p,url]);setNotice("Стикер добавлен");}catch(error){setNotice(error instanceof Error?error.message:"Не удалось загрузить стикер");}};
  const transcribe=async(audio:Blob)=>{setTranscribing(true);setModelStatus("Подготовка аудио…");try{const result=await transcribeLocally(audio,setModelStatus);setTranscript(result);setNotice("Расшифровка готова на этом устройстве");}catch(error){setNotice(error instanceof Error?error.message:"Ошибка локальной расшифровки");}finally{setTranscribing(false);setModelStatus("");}};
  const beginRecording=async()=>{try{const media=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=media;const type=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t));const r=new MediaRecorder(media,type?{mimeType:type}:undefined);const pieces:BlobPart[]=[];r.ondataavailable=e=>{if(e.data.size)pieces.push(e.data);};r.onstop=()=>{const audio=new Blob(pieces,{type:r.mimeType||"audio/webm"});setBlob(audio);media.getTracks().forEach(t=>t.stop());stream.current=null;setRecording(false);void transcribe(audio);};recorder.current=r;setSeconds(0);start.current=Date.now();setBlob(null);setTranscript("");r.start();setRecording(true);}catch{setNotice("Разрешите доступ к микрофону в браузере.");}};
  const stopRecording=()=>{if(recorder.current?.state==="recording")recorder.current.stop();};
  const save=async()=>{
    if(mode==="text"&&!text.trim()&&!attached){setNotice("Напишите несколько слов или добавьте стикер.");return;}
    if(mode==="voice"&&!blob&&!editId){setNotice("Сначала запишите голосовое сообщение.");return;}
    if(transcribing){setNotice("Подождите окончания расшифровки или сохраните после сообщения об ошибке.");return;}
    const id=editId??newId();const original=entries.find(e=>e.id===id);
    const entry:Entry={id,date:chosen,time:original?.time??new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),kind:mode,text:mode==="text"?text.trim():"",sticker:mode==="text"?attached:undefined,transcript:mode==="voice"?transcript.trim():undefined,audioId:mode==="voice"&&(blob||original?.audioId)?id:undefined,duration:mode==="voice"?seconds:undefined};
    try{
      if(blob){const response=await fetch(`/api/audio/${id}`,{method:"PUT",headers:{"Content-Type":blob.type||"audio/webm"},body:blob});if(!response.ok)throw new Error(await apiError(response,"Не удалось сохранить аудио"));}
      await writeDiary({op:"entry-upsert",entry});
      setEntries(p=>editId?p.map(x=>x.id===id?entry:x):[...p,entry]);setPage("calendar");setBlob(null);setEditId(null);setSelected(chosen);setNotice("Запись сохранена");
    }catch(error){setNotice(error instanceof Error?error.message:"Запись не сохранилась. Попробуйте ещё раз.");}
  };
  const deleteEntry=async(entry:Entry)=>{if(!confirm("Удалить эту запись?"))return;try{await writeDiary({op:"entry-delete",id:entry.id});setEntries(p=>p.filter(e=>e.id!==entry.id));}catch(error){setNotice(error instanceof Error?error.message:"Не удалось удалить запись");}};
  const toggleEntry=(entry:Entry)=>{setExpanded(expanded===entry.id?null:entry.id);if(entry.audioId&&!audioUrls[entry.id])setAudioUrls(p=>({...p,[entry.id]:`/api/audio/${entry.id}`}));};
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><img src="/fox-header.png" alt="Лисичка среди лесных листьев"/><span>Лисий дневник</span></div><nav className={`section-tabs ${section}`} aria-label="Разделы"><span className="section-highlight" aria-hidden="true"/><button className={section==="diary"?"section-active":""} aria-current={section==="diary"?"page":undefined} onClick={()=>setSection("diary")}>Лисий дневник</button><button className={section==="writing"?"section-active":""} aria-current={section==="writing"?"page":undefined} onClick={()=>setSection("writing")}>Лисья рукопись</button></nav><div className="topbar-actions">{section==="diary"&&<><button className="new-entry-link" onClick={()=>openEditor(dateKey(today))}><BookOpen size={19}/> Новая запись</button><button className="today-button" title="Сегодня" onClick={()=>{showDate(dateKey(today),true);setPage("calendar");}}><CalendarDays size={20}/></button></>}</div></header>
    {(loading||storageError||localPending)&&<div className="storage-banner" role="status">
      {loading?<span>Открываем записи…</span>:storageError?<><span>{storageError}</span><button onClick={()=>void loadServer()}>Повторить</button></>:localPending?<><span>На этом устройстве найдены старые записи. Перенести их в постоянное хранилище?</span><button disabled={importing} onClick={()=>void importLocal()}>{importing?"Переносим…":"Перенести записи"}</button></>:null}
    </div>}
    {section==="writing"?<WritingBoard/>:<div className="diary-leaf"><div className={`workspace ${tasksOpen?"":"compact"}`}>
      <aside className={`tasks-panel ${tasksOpen?"":"collapsed"}`}>
        <div className="tasks-heading"><span>❧</span>{tasksOpen&&<h2>Дела</h2>}<button aria-label={tasksOpen?"Скрыть список дел":"Показать список дел"} onClick={()=>setTasksOpen(!tasksOpen)}>{tasksOpen?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button></div>
        {tasksOpen?<>
          <div className="tasks-date"><span>На дату</span><Popover open={taskCalendarOpen} onOpenChange={setTaskCalendarOpen}><PopoverTrigger asChild><button type="button" aria-label="Выбрать дату дел" aria-expanded={taskCalendarOpen}><span>{pretty(taskDate)}</span><CalendarDays size={18} aria-hidden="true"/></button></PopoverTrigger><PopoverContent align="start" sideOffset={8} className="tasks-calendar-popover"><Calendar mode="single" required selected={selectedTaskDate} defaultMonth={selectedTaskDate} onSelect={date=>{if(date)showDate(dateKey(date));}} locale={ru} weekStartsOn={1} showOutsideDays={false} className="tasks-calendar"/></PopoverContent></Popover></div>
          <div className="tasks-list">{dayTodos.length?dayTodos.map(todo=><div className="task" key={todo.id}><label><input type="checkbox" checked={todo.done} onChange={()=>void toggleTodo(todo)}/><span className={todo.done?"done":""}>{todo.text}</span></label><button className="task-delete" aria-label="Удалить дело" onClick={()=>void deleteTodo(todo)}><X size={15}/></button></div>):<p className="tasks-empty">На этот день дел пока нет.</p>}</div>
          {addingTodo?<form className="todo-form" onSubmit={event=>{event.preventDefault();void addTodo();}}><input autoFocus value={todoText} onChange={event=>setTodoText(event.target.value)} placeholder="Новое дело" maxLength={120}/><button aria-label="Сохранить дело"><Check size={18}/></button></form>:<button className="add-todo" onClick={()=>setAddingTodo(true)}><Plus size={20}/> Добавить дело</button>}
          <div className="tasks-art" aria-hidden="true"/>
        </>:<div className="collapsed-mark" aria-hidden="true">🍃</div>}
      </aside>
      <section className="center-panel">{page==="calendar"?<><div className="month-heading"><button aria-label="Предыдущий месяц" onClick={()=>changeMonth(-1)}><ChevronLeft/></button><h1>{titles[month.getMonth()]} {month.getFullYear()}</h1><button aria-label="Следующий месяц" onClick={()=>changeMonth(1)}><ChevronRight/></button></div><div className="calendar-grid" role="grid" aria-label={`${titles[month.getMonth()]} ${month.getFullYear()}`}>{days.map(d=><div className="weekday" key={d}>{d}</div>)}{cells.map((day,index)=>{const valid=day>0&&day<=monthLength;const key=valid?dateKey(new Date(month.getFullYear(),month.getMonth(),day)):"";const entryCount=entries.filter(entry=>entry.date===key).length;const todoCount=todos.filter(todo=>todo.date===key).length;return valid?<button key={index} className={`day ${key===dateKey(today)?"today":""} ${key===taskDate?"task-selected":""}`} onClick={()=>showDate(key,true)} aria-label={`${day} ${names[month.getMonth()]}, ${entryCount} записей, ${todoCount} дел`}><span>{day}</span>{todoCount>0&&<span className="task-count" aria-hidden="true">{todoCount}</span>}{entryCount>0&&<PawPrint className="paw-mark" aria-hidden="true"/>}{entryCount>1&&<small>{entryCount}</small>}</button>:<div key={index} className="day empty"/>;})}</div><div className="add-zone"><span>❧</span><button className="paw-button" aria-label="Добавить запись" onClick={()=>openEditor(dateKey(today))}><PawPrint size={43} fill="currentColor"/></button><span>❧</span><div>Добавить запись</div></div></>:<><button className="back-button" onClick={goBack} aria-label="К календарю"><ChevronLeft/></button><div className="editor-header"><h1>{mode==="voice"?"Голосовая запись":editId?"Редактировать запись":"Новая запись"}</h1><p>{pretty(chosen)} · {editId?entries.find(e=>e.id===editId)?.time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</p></div><Tabs className="mode-tabs" value={mode} onValueChange={v=>{setMode(v as "text"|"voice");setTab(v==="voice"?"emoji":"stickers");}}><TabsList><TabsTrigger value="text"><Feather size={18}/> Текст</TabsTrigger><TabsTrigger value="voice"><Mic size={18}/> Голос</TabsTrigger></TabsList></Tabs>{mode==="text"?<><div className="writing-box"><div className="format-bar"><span><Feather size={17}/> Лист дневника</span><button title="Вставить искру" onClick={()=>insertEmoji("✨")}>✦</button><button title="Вставить лист" onClick={()=>insertEmoji("🍂")}>🍂</button></div><div className="writing-body"><textarea ref={textarea} value={text} onChange={e=>setText(e.target.value)} placeholder="О чём хочется рассказать сегодня?" aria-label="Текст записи"/>{attached&&<div className="inserted-sticker"><StickerVisual value={attached}/><button aria-label="Убрать стикер" onClick={()=>setAttached(undefined)}><X size={14}/></button></div>}</div></div><div className="editor-actions"><button className="save-button" onClick={save}><Save size={18}/> Сохранить запись</button><button className="soft-button" onClick={goBack}>Отмена</button><button className="voice-shortcut" onClick={()=>{setMode("voice");setTab("emoji");}}><Mic size={18}/> Записать голосом</button></div></>:<><div className="recorder-box"><div className="record-fox" aria-hidden="true"/><div className="wave" aria-hidden="true">{Array.from({length:37},(_,i)=><i key={i} style={{height:`${14+(i*23)%48}px`}}/>)}</div><button className="record-main" onClick={recording?stopRecording:beginRecording} aria-label={recording?"Остановить запись":"Начать запись"}>{recording?<Pause size={33} fill="currentColor"/>:<Mic size={35}/>}</button><p className="duration">{timeFormat(seconds)}</p><div className="record-actions">{recording?<button className="soft-button" onClick={stopRecording}><Square size={15}/> Остановить</button>:blob?<button className="soft-button" onClick={beginRecording}><Mic size={17}/> Перезаписать</button>:<span>Нажмите на микрофон, чтобы начать</span>}<button className="save-button" disabled={recording||transcribing} onClick={save}><Save size={18}/> Сохранить запись</button></div></div><div className="transcript-preview"><div><BookOpen size={20}/><h2>Расшифровка</h2><span>Черновик</span></div><textarea value={transcript} onChange={e=>setTranscript(e.target.value)} aria-label="Текст расшифровки" placeholder={transcribing?modelStatus||"Whisper расшифровывает голос…":blob?"Расшифровка пока недоступна. Можно вписать её вручную.":"Текст появится после записи. Его можно будет поправить."}/>{blob&&!transcribing&&!transcript&&<button onClick={()=>void transcribe(blob)}>Повторить расшифровку</button>}</div></>}</>}</section>
      <aside className="stickers-panel"><Tabs value={tab} onValueChange={v=>setTab(v as "stickers"|"emoji")}><TabsList className="sticker-tabs"><TabsTrigger value="emoji">Смайлики</TabsTrigger><TabsTrigger value="stickers">Стикеры</TabsTrigger></TabsList></Tabs><div className="sticker-grid">{tab==="stickers"?<>{Array.from({length:12},(_,i)=><button className="sticker-tile" key={i} onClick={()=>addSticker(`/stickers/sticker-${i+1}.png`)} aria-label={`Добавить стикер ${i+1}`}><span className="sticker-sprite" style={{backgroundPosition:`${(i%4)*100/3}% ${Math.floor(i/4)*50}%`}}/></button>)}{stickers.map((src,i)=><button className="sticker-tile" key={i} onClick={()=>addSticker(src)} aria-label="Добавить свой стикер"><img src={src} alt=""/></button>)}<button className="sticker-tile add-sticker" onClick={()=>fileInput.current?.click()}><Plus size={25}/><span>Добавить свой</span></button></>:emoji.map((e,i)=><button className="sticker-tile emoji-tile" key={i} onClick={()=>insertEmoji(e)} aria-label={`Добавить ${e}`}>{e}</button>)}</div><input className="sr-only" ref={fileInput} type="file" accept="image/*" onChange={e=>{upload(e.target.files?.[0]);e.target.value="";}}/><p className="sticker-hint">{page==="editor"?"Нажмите, чтобы добавить в запись":"Нажмите на стикер, чтобы открыть запись"}</p></aside>
    </div>
    <Dialog open={!!selected&&page==="calendar"} onOpenChange={v=>{if(!v)setSelected(null);}}><DialogContent className="day-dialog" showCloseButton={false}><DialogHeader><DialogTitle>{selected&&pretty(selected)}</DialogTitle><button className="dialog-close" onClick={()=>setSelected(null)} aria-label="Закрыть"><X size={23}/></button></DialogHeader><div className="day-entry-list">{dayEntries.length?dayEntries.map(e=><div className="entry-line" key={e.id}><time>{e.time}</time><article className="entry-card"><div className="entry-label">{e.kind==="text"?<BookOpen size={19}/>:<Mic size={19}/>}<span>{e.kind==="text"?"Текстовая запись":"Голосовая запись"}</span><div className="entry-controls"><button aria-label="Редактировать" onClick={()=>{setSelected(null);openEditor(e.date,e);}}><Feather size={17}/></button><button aria-label="Удалить" onClick={()=>void deleteEntry(e)}><Trash2 size={17}/></button></div></div>{e.kind==="text"?<div className="entry-text">{e.text}{e.sticker&&<span className="entry-sticker"><StickerVisual value={e.sticker}/></span>}</div>:<><button className="voice-expand" aria-expanded={expanded===e.id} onClick={()=>void toggleEntry(e)}><Play size={17} fill="currentColor"/><span className="mini-wave">▂▅▃▆▂▇▅▂▆▃▅▇▂▆▃▂▅▃</span><span>{timeFormat(e.duration)}</span>{expanded===e.id?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>{expanded===e.id&&<div className="voice-details">{audioUrls[e.id]?<audio controls src={audioUrls[e.id]} aria-label="Прослушать запись"/>:<p className="audio-missing">Аудиофайл этой примерной записи отсутствует.</p>}<h3>Расшифровка</h3><p>{e.transcript||"Расшифровки пока нет."}</p></div>}</>}</article></div>):<div className="empty-day">🍂<p>На этот день ещё нет записей.</p></div>}</div><button className="dialog-add" onClick={()=>{setSelected(null);openEditor(chosen);}}><PawPrint size={19} fill="currentColor"/> Добавить запись</button></DialogContent></Dialog>
    {notice&&<div className="toast" role="status">{notice}</div>}</div>}
  </main>;
}
