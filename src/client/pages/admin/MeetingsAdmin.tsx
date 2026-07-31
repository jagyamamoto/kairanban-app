// 会合管理: 作成・状態変更(公開/締切/終了)・出欠集計・代理入力(紙/電話/当日受付)・リマインド・CSV
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDate } from "../../util";
import {
  AUDIENCE_LABELS,
  MEETING_ANSWER_LABELS,
  MEETING_STATUS_LABELS,
  audienceLabel,
} from "../../../shared/labels";
import { Btn } from "../../Btn";

type Row = {
  id: number;
  case_no: string;
  title: string;
  date: string;
  start_time: string | null;
  place: string | null;
  audience: string;
  has_meal: number;
  deadline: string | null;
  status: string;
  created_by_name: string;
  response_count: number;
};

type SummaryData = {
  targets: {
    person_id: number;
    name: string;
    answer: string | null;
    headcount: number | null;
    meal_count: number | null;
    note: string | null;
    proxy_name: string | null;
  }[];
  counts: {
    yes: number;
    no: number;
    undecided: number;
    unanswered: number;
    headcount: number;
    meal: number;
  };
};

const STATUS_CHIP: Record<string, string> = {
  draft: "chip-gray",
  open: "chip-green",
  closed: "chip-orange",
  done: "chip-gray",
};

function CreateForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [place, setPlace] = useState("");
  const [audience, setAudience] = useState("officers");
  const [hasMeal, setHasMeal] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label htmlFor="mtga-title">会合名</label>
      <input id="mtga-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="mtga-date">開催日</label>
      <input id="mtga-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label htmlFor="mtga-start-time">開始時刻(任意)</label>
      <input id="mtga-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      <label htmlFor="mtga-place">場所(任意)</label>
      <input id="mtga-place" value={place} onChange={(e) => setPlace(e.target.value)} />
      <label htmlFor="mtga-audience">対象</label>
      <select id="mtga-audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
        {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={hasMeal}
          onChange={(e) => setHasMeal(e.target.checked)}
        />
        食事あり(人数を回答してもらう)
      </label>
      <label htmlFor="mtga-deadline">回答期限(任意)</label>
      <input id="mtga-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          if (!title.trim() || !date) {
            setErr("会合名と開催日を入力してください");
            return;
          }
          setBusy(true);
          try {
            await api("/api/admin/meetings", {
              body: {
                title,
                date,
                start_time: startTime || undefined,
                place: place || undefined,
                audience,
                has_meal: hasMeal,
                deadline: deadline || undefined,
              },
            });
            setTitle("");
            setDate("");
            setStartTime("");
            setPlace("");
            setDeadline("");
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "作成に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        下書きを作成
      </Btn>
    </div>
  );
}

function SummaryView({ id, hasMeal }: { id: number; hasMeal: number }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [persons, setPersons] = useState<{ id: number; name: string }[]>([]);
  const [proxyPersonId, setProxyPersonId] = useState("");
  const [proxyAnswer, setProxyAnswer] = useState("yes");
  const [proxyHeadcount, setProxyHeadcount] = useState(1);
  const [proxyMeal, setProxyMeal] = useState(1);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    api<SummaryData>(`/api/admin/meetings/${id}/summary`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
    api<{ persons: { id: number; name: string }[] }>("/api/admin/persons/options")
      .then((d) => setPersons(d.persons))
      .catch(() => {});
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;

  return (
    <div style={{ marginTop: 10 }}>
      <p>
        出席{" "}
        <strong className="ok-note">
          {data.counts.yes}件({data.counts.headcount}名)
        </strong>{" "}
        ・ 欠席 {data.counts.no}件 ・ 未定 {data.counts.undecided}件 ・ 未回答{" "}
        <strong className={data.counts.unanswered ? "error" : ""}>
          {data.counts.unanswered}件
        </strong>
        {!!hasMeal && (
          <>
            {" "}
            ・ 食事 <strong>{data.counts.meal}食</strong>
          </>
        )}
      </p>
      {msg && <p className="ok-note">{msg}</p>}
      <div className="row">
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            if (!window.confirm("未回答の方へ通知でリマインドを送りますか?")) return;
            const r = await api<{ sent: number; skipped: number }>(
              `/api/admin/meetings/${id}/remind`,
              { body: {} },
            );
            setMsg(`リマインド送信: ${r.sent}件(送れなかった方: ${r.skipped}件)`);
            await load();
          }}
        >
          未回答者へリマインド
        </button>
        <a
          className="btn btn-secondary btn-sm"
          href={`/api/admin/meetings/${id}/csv`}
          style={{ textDecoration: "none" }}
        >
          CSVをダウンロード
        </a>
      </div>

      <table className="simple" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>名前</th>
            <th>回答</th>
            <th>人数</th>
            {!!hasMeal && <th>食事</th>}
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {data.targets.map((t) => (
            <tr key={t.person_id}>
              <td>{t.name}</td>
              <td>
                {t.answer ? (
                  <>
                    {MEETING_ANSWER_LABELS[t.answer] ?? t.answer}
                    {t.proxy_name && <span className="muted">(代理:{t.proxy_name})</span>}
                  </>
                ) : (
                  <span className="error">未回答</span>
                )}
              </td>
              <td>{t.headcount ?? ""}</td>
              {!!hasMeal && <td>{t.meal_count ?? ""}</td>}
              <td>{t.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details style={{ marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>
          紙・電話・当日受付を代理入力する
        </summary>
        <label htmlFor="mtga-proxy-person-id">対象者</label>
        <select id="mtga-proxy-person-id" value={proxyPersonId} onChange={(e) => setProxyPersonId(e.target.value)}>
          <option value="">選んでください</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label htmlFor="mtga-proxy-answer">出欠</label>
        <select id="mtga-proxy-answer" value={proxyAnswer} onChange={(e) => setProxyAnswer(e.target.value)}>
          <option value="yes">出席</option>
          <option value="no">欠席</option>
          <option value="undecided">未定</option>
        </select>
        <label htmlFor="mtga-proxy-headcount">人数</label>
        <input
          id="mtga-proxy-headcount"
          type="number"
          min={1}
          value={proxyHeadcount}
          onChange={(e) => setProxyHeadcount(Number(e.target.value) || 1)}
        />
        {!!hasMeal && (
          <>
            <label htmlFor="mtga-proxy-meal">食事の数</label>
            <input
              id="mtga-proxy-meal"
              type="number"
              min={0}
              value={proxyMeal}
              onChange={(e) => setProxyMeal(Number(e.target.value) || 0)}
            />
          </>
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            if (!proxyPersonId) {
              setErr("対象者を選んでください");
              return;
            }
            try {
              await api(`/api/admin/meetings/${id}/proxy-respond`, {
                body: {
                  person_id: Number(proxyPersonId),
                  answer: proxyAnswer,
                  headcount: proxyHeadcount,
                  meal_count: proxyMeal,
                },
              });
              setProxyPersonId("");
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "登録に失敗しました");
            }
          }}
        >
          代理で登録
        </button>
      </details>
    </div>
  );
}

export default function MeetingsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ meetings: Row[] }>("/api/admin/meetings")
      .then((d) => setRows(d.meetings))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
  }, []);

  const act = async (path: string, body: unknown, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await api(path, { body });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      {err && <p className="error">{err}</p>}

      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 新しい会合を作る</summary>
        <CreateForm onDone={load} />
      </details>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows?.map((m) => (
        <div className="card" key={m.id}>
          <div className="spread">
            <strong>{m.title}</strong>
            <span className={`chip ${STATUS_CHIP[m.status] ?? "chip-gray"}`}>
              {MEETING_STATUS_LABELS[m.status] ?? m.status}
            </span>
          </div>
          <div className="muted">
            {m.case_no} ・ {fmtDate(m.date)}
            {m.start_time && ` ${m.start_time}〜`}
            {m.place && ` ・ ${m.place}`}
            <br />
            対象: {audienceLabel(m.audience)}
            {!!m.has_meal && " ・ 食事あり"}
            {m.deadline && <> ・ 回答期限: {fmtDate(m.deadline)}</>}
            <br />
            作成: {m.created_by_name} ・ 回答 {m.response_count}件
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {m.status === "draft" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/meetings/${m.id}/status`,
                    { status: "open" },
                    "公開すると対象者へ通知が送られます。よろしいですか?",
                  )
                }
              >
                公開する
              </button>
            )}
            {m.status === "open" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/meetings/${m.id}/status`,
                    { status: "closed" },
                    "回答受付を締め切りますか?",
                  )
                }
              >
                締め切る
              </button>
            )}
            {m.status === "closed" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/meetings/${m.id}/status`,
                    { status: "open" },
                    "受付を再開しますか?",
                  )
                }
              >
                受付を再開
              </button>
            )}
            {["open", "closed"].includes(m.status) && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/meetings/${m.id}/status`,
                    { status: "done" },
                    "この会合を終了にしますか?(以後は変更できません)",
                  )
                }
              >
                終了にする
              </button>
            )}
            {m.status !== "draft" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
              >
                集計 {openId === m.id ? "▲" : "▼"}
              </button>
            )}
          </div>
          {openId === m.id && <SummaryView id={m.id} hasMeal={m.has_meal} />}
        </div>
      ))}
    </div>
  );
}
