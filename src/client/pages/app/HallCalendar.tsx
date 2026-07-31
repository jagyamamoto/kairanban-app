// 会館予約カレンダー: 1か月分の空き/仮予約/確定を色で一覧表示(オーナー指示)
import { useEffect, useState } from "react";
import { api } from "../../api";
import { todayStr } from "../../util";

export type CalSlot = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  org_name: string;
  provisional: boolean;
  is_mine: boolean;
  has_waitlist: boolean;
  waitlist_is_mine: boolean;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function ym(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export default function HallCalendar({
  selectedDate,
  onPickDate,
}: {
  selectedDate?: string;
  onPickDate?: (date: string) => void;
}) {
  const today = todayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [slots, setSlots] = useState<CalSlot[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const from = `${ym(year, month)}-01`;
    const to = `${ym(year, month)}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
    setSlots(null);
    api<{ slots: CalSlot[] }>(`/api/reservations/calendar?from=${from}&to=${to}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
        setSlots([]);
      });
  }, [year, month]);

  const shift = (delta: number) => {
    const m = month + delta;
    if (m < 0) {
      setYear(year - 1);
      setMonth(11);
    } else if (m > 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(m);
    }
  };

  const byDate = new Map<string, CalSlot[]>();
  for (const s of slots ?? []) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  const total = daysInMonth(year, month);
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${ym(year, month)}-${String(d).padStart(2, "0")}`);
  }

  return (
    <div className="card">
      {/* 月の名前が主役。送りボタンは脇役の大きさにする */}
      <div className="spread cal-nav">
        <button
          className="btn btn-secondary btn-sm"
          aria-label="前の月を見る"
          onClick={() => shift(-1)}
        >
          ←前
        </button>
        <strong className="cal-title">
          {year}年{month + 1}月
        </strong>
        <button
          className="btn btn-secondary btn-sm"
          aria-label="次の月を見る"
          onClick={() => shift(1)}
        >
          次→
        </button>
      </div>

      {err && <p className="error">{err}</p>}
      {slots === null && <p className="muted center">読み込み中…</p>}

      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-head${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="cal-cell empty" />;
          const day = Number(date.slice(8));
          const daySlots = byDate.get(date) ?? [];
          const past = date < today;
          const confirmed = daySlots.filter((s) => !s.provisional).length;
          const provisional = daySlots.filter((s) => s.provisional).length;
          const cls = [
            "cal-cell",
            past ? "past" : "",
            date === today ? "today" : "",
            date === selectedDate ? "picked" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={date}
              className={cls}
              disabled={past}
              onClick={() => onPickDate?.(date)}
              title={daySlots.map((s) => `${s.start_time}〜${s.end_time} ${s.org_name}`).join("\n")}
            >
              <span className="cal-day">{day}</span>
              {/* ⚠ 色だけで区別しない(色覚特性・白内障の方にも伝わるよう記号を併記) */}
              <span className="cal-marks">
                {confirmed > 0 && <span className="cal-mark confirmed">●</span>}
                {provisional > 0 && <span className="cal-mark provisional">△</span>}
                {daySlots.length === 0 && !past && <span className="cal-mark free">○</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span>
          <span className="cal-mark free">○</span>空き
        </span>
        <span>
          <span className="cal-mark provisional">△</span>仮予約あり(承認前)
        </span>
        <span>
          <span className="cal-mark confirmed">●</span>予約確定あり
        </span>
      </div>
      <p className="field-note" style={{ marginTop: 6 }}>
        ●や△の日でも、ほかの時間帯は空いていることがあります。日付を押すと時間帯が見られます。
      </p>

      {selectedDate && (
        <div style={{ marginTop: 10 }}>
          <strong>{selectedDate.replace(/-/g, "/")} の予約</strong>
          {(byDate.get(selectedDate) ?? []).length === 0 ? (
            <p className="ok-note">この日はまだ予約がありません。</p>
          ) : (
            (byDate.get(selectedDate) ?? []).map((s) => (
              <div className="list-item" key={s.id}>
                {s.start_time}〜{s.end_time} {s.org_name}
                {s.provisional ? (
                  <span className="chip chip-orange">仮予約</span>
                ) : (
                  <span className="chip chip-green">確定</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
