// 会合一覧(未回答を上に)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { fmtDate } from "../../util";
import { MEETING_ANSWER_LABELS, MEETING_STATUS_LABELS } from "../../../shared/labels";

type Row = {
  id: number;
  case_no: string;
  title: string;
  date: string;
  deadline: string | null;
  status: string;
  answer: string | null;
};

export default function Meetings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api<{ meetings: Row[] }>("/api/meetings")
      .then((d) => setRows(d.meetings))
      .catch(() => setRows([]));
  }, []);

  const sorted = rows ? [...rows].sort((a, b) => Number(!!a.answer) - Number(!!b.answer)) : null;

  return (
    <div>
      <h2>会合</h2>
      {sorted === null && <p className="muted">読み込み中…</p>}
      {sorted !== null && sorted.length === 0 && (
        <div className="card">
          <p>会合はまだありません。</p>
        </div>
      )}
      {sorted?.map((m) => (
        <Link
          key={m.id}
          to={`/app/meetings/${m.id}`}
          className="card"
          style={{ display: "block", textDecoration: "none", color: "inherit" }}
        >
          <div className="spread">
            <strong style={{ fontSize: 19 }}>{m.title}</strong>
            {m.answer ? (
              <span className="chip chip-green">
                {MEETING_ANSWER_LABELS[m.answer] ?? m.answer}
              </span>
            ) : m.status === "open" ? (
              <span className="chip chip-red">未回答</span>
            ) : (
              <span className="chip chip-gray">{MEETING_STATUS_LABELS[m.status]}</span>
            )}
          </div>
          <div className="muted">
            {fmtDate(m.date)}
            {m.deadline && <> ・ 回答期限: {fmtDate(m.deadline)}</>}
          </div>
        </Link>
      ))}
    </div>
  );
}
