// 会合詳細: 出欠回答(出席/欠席/未定・人数・食事数・備考)。締切後は読み取りのみ。
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { fmtDate } from "../../util";
import { MEETING_STATUS_LABELS } from "../../../shared/labels";

type Detail = {
  meeting: {
    id: number;
    case_no: string;
    title: string;
    date: string;
    start_time: string | null;
    place: string | null;
    has_meal: number;
    deadline: string | null;
    status: string;
  };
  response: {
    answer: string;
    headcount: number;
    meal_count: number;
    note: string | null;
    proxy_by: number | null;
  } | null;
};

const ANSWERS: { key: string; label: string; icon: string }[] = [
  { key: "yes", label: "出席", icon: "⭕" },
  { key: "no", label: "欠席", icon: "✕" },
  { key: "undecided", label: "未定", icon: "△" },
];

export default function MeetingDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [answer, setAnswer] = useState("yes");
  const [headcount, setHeadcount] = useState(1);
  const [mealCount, setMealCount] = useState(1);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () =>
    api<Detail>(`/api/meetings/${id}`).then((d) => {
      setData(d);
      if (d.response) {
        setAnswer(d.response.answer);
        setHeadcount(d.response.headcount);
        setMealCount(d.response.meal_count);
        setNote(d.response.note ?? "");
      }
    });

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, [id]);

  if (err) {
    return (
      <div className="card">
        <p className="error">{err}</p>
        <Link className="btn btn-secondary" to="/app/meetings">
          会合一覧へもどる
        </Link>
      </div>
    );
  }
  if (!data) return <p className="muted">読み込み中…</p>;

  const m = data.meeting;
  const canRespond = m.status === "open";
  const hasResponse = !!data.response;

  return (
    <div>
      <Link to="/app/meetings">← 会合一覧へもどる</Link>
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>{m.title}</h2>
        <p className="muted">
          {m.case_no} ・ {fmtDate(m.date)}
          {m.start_time && ` ${m.start_time}〜`}
          {m.place && ` ・ ${m.place}`}
        </p>
        {m.deadline && (
          <p>
            <span className="chip chip-orange">回答期限: {fmtDate(m.deadline)}</span>
          </p>
        )}
        {!canRespond && (
          <p className="muted">
            現在の状態: {MEETING_STATUS_LABELS[m.status]}(回答内容の変更は役員にお伝えください)
          </p>
        )}
      </div>

      <div className="card">
        <p className="group-label">出欠</p>
        <div className="row">
          {ANSWERS.map((a) => (
            <button
              key={a.key}
              className={`btn ${answer === a.key ? "btn-primary" : "btn-secondary"} btn-sm`}
              disabled={!canRespond}
              onClick={() => {
                setAnswer(a.key);
                setSaved(false);
              }}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>

        <label htmlFor="mtg-people">人数(ご本人+同伴者)</label>
        <input
          id="mtg-people"
          type="number"
          min={1}
          max={30}
          value={headcount}
          disabled={!canRespond}
          onChange={(e) => {
            setHeadcount(Number(e.target.value) || 1);
            setSaved(false);
          }}
        />

        {!!m.has_meal && (
          <>
            <label htmlFor="mtg-meals">食事の数</label>
            <input
              id="mtg-meals"
              type="number"
              min={0}
              max={30}
              value={mealCount}
              disabled={!canRespond}
              onChange={(e) => {
                setMealCount(Number(e.target.value) || 0);
                setSaved(false);
              }}
            />
            <p className="field-note">アレルギー等がある場合は下の備考にご記入ください。</p>
          </>
        )}

        <label htmlFor="mtg-note">備考(任意)</label>
        <textarea
          id="mtg-note"
          value={note}
          disabled={!canRespond}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
        />

        {err && <p className="error">{err}</p>}
        {saved && <p className="ok-note">回答を保存しました。</p>}
        {canRespond && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setErr("");
              setBusy(true);
              try {
                await api(`/api/meetings/${m.id}/respond`, {
                  body: { answer, headcount, meal_count: mealCount, note },
                });
                await load();
                setSaved(true);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "回答の送信に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
          >
            {hasResponse ? "回答を更新する" : "回答する"}
          </button>
        )}
      </div>
    </div>
  );
}
