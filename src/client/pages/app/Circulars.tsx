// 回覧一覧(未確認を上に)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { fmtDate } from "../../util";

type CircularRow = {
  id: number;
  case_no: string;
  title: string;
  deadline: string | null;
  published_at: string;
  status: string;
  opened_at: string | null;
  confirmed_at: string | null;
};

export default function Circulars() {
  const [rows, setRows] = useState<CircularRow[] | null>(null);
  useEffect(() => {
    api<{ circulars: CircularRow[] }>("/api/circulars")
      .then((d) => setRows(d.circulars))
      .catch(() => setRows([]));
  }, []);

  const sorted = rows
    ? [...rows].sort((a, b) => Number(!!a.confirmed_at) - Number(!!b.confirmed_at))
    : null;

  return (
    <div>
      <h2>回覧</h2>
      {sorted === null && <p className="muted">読み込み中…</p>}
      {sorted !== null && sorted.length === 0 && (
        <div className="card">
          <p>回覧はまだありません。</p>
        </div>
      )}
      {sorted?.map((c) => (
        <Link
          key={c.id}
          to={`/app/circulars/${c.id}`}
          className="card"
          style={{ display: "block", textDecoration: "none", color: "inherit" }}
        >
          <div className="spread">
            <strong style={{ fontSize: 19 }}>{c.title}</strong>
            {c.status === "archived" ? (
              <span className="chip chip-gray">終了</span>
            ) : c.confirmed_at ? (
              <span className="chip chip-green">確認済み</span>
            ) : (
              <span className="chip chip-red">未確認</span>
            )}
          </div>
          <div className="muted">
            {c.case_no}
            {c.deadline && <> ・ 期限: {fmtDate(c.deadline)}</>}
          </div>
        </Link>
      ))}
    </div>
  );
}
