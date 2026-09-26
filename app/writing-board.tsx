"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Feather, Plus, Save, Settings2, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Book = { id: string; title: string; color: string; createdAt: string };
type MonthPlan = { bookId: string; month: string; targetChars: number; workDays: number };
type WorkDay = { bookId: string; date: string; actualChars: number | null; worked: boolean };
type WritingData = { books: Book[]; months: MonthPlan[]; days: WorkDay[] };
const palette = ["sage", "teal", "blue", "rose", "amber"];
const paletteNames: Record<string, string> = { sage: "Шалфей", teal: "Морская волна", blue: "Чернила", rose: "Пыльная роза", amber: "Мёд" };
const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const format = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const labelFor = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d)).replace(" г.", ""); };
const idFor = () => crypto.randomUUID();
async function send(payload: unknown) {
  const response = await fetch("/api/writing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; throw new Error(result.error ?? "Не удалось сохранить данные"); }
  return response.json();
}

export default function WritingBoard() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData] = useState<WritingData>({ books: [], months: [], days: [] });
  const [bookId, setBookId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const [worked, setWorked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState("sage");
  const [planDraft, setPlanDraft] = useState({ key: "", target: "", workDays: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const settingsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/writing", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; throw new Error(result.error ?? "Не удалось загрузить книги"); }
      return response.json() as Promise<WritingData>;
    }).then(result => {
      setData(result);
      setBookId(current => result.books.some(book => book.id === current) ? current : result.books[0]?.id ?? null);
      setError("");
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить книги"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);

  const book = data.books.find(item => item.id === bookId);
  const monthKey = keyFor(month).slice(0, 7);
  const plan = data.months.find(item => item.bookId === bookId && item.month === monthKey);
  const draftKey = `${bookId}:${monthKey}`;
  const target = planDraft.key === draftKey ? planDraft.target : plan ? String(plan.targetChars) : "";
  const workDays = planDraft.key === draftKey ? planDraft.workDays : plan ? String(plan.workDays) : "";
  const targetChars = plan?.targetChars ?? 0;
  const plannedDays = plan?.workDays ?? 0;
  const daily = plannedDays ? targetChars / plannedDays : 0;
  const monthDays = data.days.filter(item => item.bookId === bookId && item.date.startsWith(monthKey));
  const total = monthDays.reduce((sum, item) => sum + (item.actualChars ?? 0), 0);
  const workedCount = monthDays.filter(item => item.worked).length;
  const dayMap = new Map(monthDays.map(item => [item.date, item]));
  const monthLength = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + monthLength) / 7) * 7 }, (_, index) => index - offset + 1);
  const changeMonth = (step: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + step, 1));
  const openDay = (date: string) => { const entry = dayMap.get(date); setSelected(date); setActual(entry?.actualChars == null ? "" : String(entry.actualChars)); setWorked(entry?.worked ?? false); };
  const chooseBook = (id: string) => { setBookId(id); setSelected(null); };

  const createBook = async () => {
    const title = newTitle.trim();
    if (!title) { setError("Напишите название книги"); return; }
    setBusy(true); setError("");
    try {
      const id = idFor();
      const result = await send({ op: "book-create", id, title, color: newColor }) as { book: Book };
      setData(previous => ({ ...previous, books: [...previous.books, result.book] }));
      setBookId(id); setNewTitle(""); setNewBookOpen(false); setNotice("Книга добавлена");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить книгу"); }
    finally { setBusy(false); }
  };
  const savePlan = async () => {
    if (!bookId) return;
    const nextTarget = target === "" ? 0 : Number(target);
    const nextDays = workDays === "" ? 0 : Number(workDays);
    if (!Number.isInteger(nextTarget) || nextTarget < 0 || nextTarget > 100_000_000 || !Number.isInteger(nextDays) || nextDays < 0 || nextDays > monthLength) { setError("Укажите целое число знаков и число дней в пределах месяца"); return; }
    setBusy(true); setError("");
    try {
      await send({ op: "month-upsert", bookId, month: monthKey, targetChars: nextTarget, workDays: nextDays });
      setData(previous => ({ ...previous, months: [...previous.months.filter(item => !(item.bookId === bookId && item.month === monthKey)), { bookId, month: monthKey, targetChars: nextTarget, workDays: nextDays }] }));
      setNotice("План на месяц сохранён");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить план"); }
    finally { setBusy(false); }
  };
  const saveDay = async () => {
    if (!bookId || !selected) return;
    const amount = actual.trim() === "" ? null : Number(actual);
    if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 100_000_000)) { setError("Укажите целое число знаков от нуля"); return; }
    const isWorked = worked || amount !== null;
    setBusy(true); setError("");
    try {
      await send({ op: "day-upsert", bookId, date: selected, actualChars: amount, worked: isWorked });
      const day: WorkDay = { bookId, date: selected, actualChars: amount, worked: isWorked };
      setData(previous => ({ ...previous, days: [...previous.days.filter(item => !(item.bookId === bookId && item.date === selected)), ...(isWorked ? [day] : [])] }));
      setSelected(null); setNotice("День сохранён");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить день"); }
    finally { setBusy(false); }
  };
  const deleteBook = async () => {
    if (!book) return;
    setBusy(true); setError("");
    try {
      await send({ op: "book-delete", bookId: book.id });
      setData(previous => ({ books: previous.books.filter(item => item.id !== book.id), months: previous.months.filter(item => item.bookId !== book.id), days: previous.days.filter(item => item.bookId !== book.id) }));
      setBookId(data.books.find(item => item.id !== book.id)?.id ?? null); setConfirmDelete(false); setNotice("Книга удалена");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить книгу"); }
    finally { setBusy(false); }
  };

  return <div className="writing-board" data-book-color={book?.color ?? "sage"}>
    <div className="writing-intro"><div><span className="writing-eyebrow"><Feather size={16}/> Тихая работа над историями</span><h1>Лисья рукопись</h1><p>У каждой книги свой путь. Здесь видны дни, когда ты к ней возвращалась.</p></div><div className="writing-intro-art" aria-hidden="true"><BookOpen size={83} strokeWidth={1}/></div></div>
    {error && <div className="writing-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрыть"><X size={16}/></button></div>}
    <div className="book-strip" aria-label="Книги">{data.books.map(item => <button key={item.id} className={`book-tab ${item.id === bookId ? "selected" : ""}`} data-color={item.color} onClick={() => chooseBook(item.id)}><BookOpen size={17}/>{item.title}</button>)}<button className="book-add" onClick={() => { setNewColor(palette[data.books.length % palette.length]); setNewBookOpen(true); }}><Plus size={18}/> Добавить книгу</button></div>
    {loading ? <div className="writing-empty">Открываем рукописи…</div> : !book ? <div className="writing-empty"><BookOpen size={52}/><h2>Начни с первой книги</h2><p>Дай ей название, а затем задай план на месяц.</p><button onClick={() => setNewBookOpen(true)}><Plus size={18}/> Добавить книгу</button></div> : <div className={`writing-layout ${settingsOpen ? "" : "settings-collapsed"}`}>
      <section className="writing-calendar-panel" aria-label="Календарь рукописи">
        <div className="writing-calendar-top"><div><span className="writing-kicker">{book.title}</span><h2>Календарь работы</h2></div><button className="writing-mobile-settings-toggle" onClick={() => { setSettingsOpen(true); requestAnimationFrame(() => settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}><Settings2 size={16}/> План и итоги</button><div className="writing-month"><button onClick={() => changeMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={21}/></button><span>{monthNames[month.getMonth()]} {month.getFullYear()}</span><button onClick={() => changeMonth(1)} aria-label="Следующий месяц"><ChevronRight size={21}/></button></div></div>
        <div className="writing-calendar-grid" role="grid" aria-label={`${monthNames[month.getMonth()]} ${month.getFullYear()}`}>
          {weekdays.map(day => <div className="writing-weekday" key={day}>{day}</div>)}
          {cells.map((number, index) => { if (number < 1 || number > monthLength) return <div className="writing-day blank" key={index}/>; const date = keyFor(new Date(month.getFullYear(), month.getMonth(), number)); const record = dayMap.get(date); const amount = record?.actualChars; const level = amount == null ? 0 : amount === 0 ? 1 : daily > 0 ? amount >= daily ? 3 : amount >= daily / 2 ? 2 : 1 : amount >= 25000 ? 3 : amount >= 15000 ? 2 : 1; return <button key={index} className={`writing-day level-${level} ${date === keyFor(today) ? "today" : ""}`} onClick={() => openDay(date)} aria-label={`${labelFor(date)}${record?.worked ? ", рабочий день" : ""}${amount != null ? `, ${format(amount)} знаков` : ""}`}><span className="writing-day-number">{number}</span>{record?.worked && <BookOpen className="writing-book-mark" size={23} strokeWidth={1.4} aria-hidden="true"/>}{amount != null && <small>{format(amount)}</small>}</button>; })}
        </div>
        <div className="writing-legend"><span><i className="legend-book"><BookOpen size={17}/></i> Рабочий день</span><span><i className="legend-light"/> {daily ? "Меньше половины ориентира" : "До 15 000"}</span><span><i className="legend-mid"/> {daily ? "До ориентира" : "15 000–24 999"}</span><span><i className="legend-strong"/> {daily ? "Ориентир достигнут" : "От 25 000"}</span></div>
      </section>
      <aside ref={settingsRef} className={`writing-settings ${settingsOpen ? "" : "closed"}`}><div className="writing-settings-heading"><Settings2 size={21}/>{settingsOpen && <h2>План и итоги</h2>}<button onClick={() => setSettingsOpen(!settingsOpen)} aria-label={settingsOpen ? "Свернуть настройки" : "Развернуть настройки"}>{settingsOpen ? <ChevronRight size={19}/> : <ChevronLeft size={19}/>}</button></div>{settingsOpen && <div className="writing-settings-body"><span className="writing-kicker">{monthNames[month.getMonth()]} {month.getFullYear()}</span><p className="writing-settings-hint">План задаётся отдельно для каждого месяца и каждой книги.</p><label>План на месяц, знаков<input type="number" min="0" max="100000000" step="1" value={target} onChange={event => setPlanDraft({ key: draftKey, target: event.target.value, workDays })} placeholder="Например, 300000"/></label><label>Рабочих дней в месяце<input type="number" min="0" max={monthLength} step="1" value={workDays} onChange={event => setPlanDraft({ key: draftKey, target, workDays: event.target.value })} placeholder="Например, 16"/></label><button className="writing-primary" disabled={busy} onClick={() => void savePlan()}><Save size={17}/> Сохранить план</button><div className="writing-daily"><span>Ориентир на день</span><strong>{plannedDays ? format(daily) : "—"}</strong><small>знаков · цель ÷ рабочие дни</small></div><div className="writing-summary"><div><span>Написано за месяц</span><strong>{format(total)}</strong></div><div><span>Отмечено рабочих дней</span><strong>{workedCount}</strong></div><div><span>До месячной цели</span><strong>{format(Math.max(0, targetChars - total))}</strong></div></div><p className="writing-settings-note">Факт не меняет дневной ориентир. Рабочие даты отмечаются в календаре по желанию.</p><button className="writing-delete" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 size={15}/> Удалить книгу</button></div>}</aside>
    </div>}
    <Dialog open={newBookOpen} onOpenChange={setNewBookOpen}><DialogContent className="writing-dialog"><DialogHeader><DialogTitle>Новая книга</DialogTitle></DialogHeader><label>Название<input autoFocus maxLength={80} value={newTitle} onChange={event => setNewTitle(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void createBook(); }} placeholder="Например, Лесная история"/></label><div className="writing-color-label">Цвет книги</div><div className="writing-color-options">{palette.map(color => <button key={color} className={newColor === color ? "chosen" : ""} data-color={color} aria-label={paletteNames[color]} title={paletteNames[color]} onClick={() => setNewColor(color)}>{newColor === color && <Check size={18}/>}</button>)}</div>{error && <p className="writing-dialog-error" role="alert">{error}</p>}<button className="writing-primary" onClick={() => void createBook()} disabled={busy}><Plus size={17}/> Добавить книгу</button></DialogContent></Dialog>
    <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent className="writing-dialog"><DialogHeader><DialogTitle>Удалить книгу?</DialogTitle></DialogHeader><p className="writing-dialog-hint">«{book?.title}» и все её планы и отметки будут удалены.</p><div className="writing-confirm-actions"><button onClick={() => setConfirmDelete(false)}>Отмена</button><button className="writing-danger" disabled={busy} onClick={() => void deleteBook()}><Trash2 size={17}/> Удалить</button></div></DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="writing-dialog"><DialogHeader><DialogTitle>{selected && labelFor(selected)}</DialogTitle></DialogHeader><p className="writing-dialog-hint">{book?.title} · ориентир {daily ? `${format(daily)} знаков` : "пока не задан"}</p><label>Написано знаков<input autoFocus type="number" min="0" max="100000000" step="1" value={actual} onChange={event => { setActual(event.target.value); if (event.target.value !== "") setWorked(true); }} placeholder="Можно оставить пустым"/></label><label className="writing-checkbox"><input type="checkbox" checked={worked || actual.trim() !== ""} onChange={event => { setWorked(event.target.checked); if (!event.target.checked) setActual(""); }}/><span>Это был рабочий день</span></label><p className="writing-dialog-hint">Даже при 0 знаков рабочий день будет отмечен книжечкой.</p>{error && <p className="writing-dialog-error" role="alert">{error}</p>}<button className="writing-primary" disabled={busy} onClick={() => void saveDay()}><Save size={17}/> Сохранить день</button></DialogContent></Dialog>
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
