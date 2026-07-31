// 会員レベル(役割)の変更依頼: 会員からの依頼を確認し、対応済み/見送りにする。
// 実際の役割変更は「会員」タブの各会員カードから行う(依頼はきっかけの記録)。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { fmtDateTime } from "../../util";

type Row = {
  id: number;
  person_id: number;
  person_name: string;
  message: string;
  status: string;
  handled_by_name: string | null;
  handled_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "未対応",
  done: "対応済み",
  declined: "見送り",
};
const STATUS_CHIP: Record<string, string> = {
  new: "chip-red",
  done: "chip-green",
  declined: "chip-gray",
};

export default function RoleRequests() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ requests: Row[] }>("/api/admin/role-requests")
      .then((d) => setRows(d.requests))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
        setRows([]);
      });
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/admin/role-requests/${id}/status`, { body: { status } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  const newCount = rows?.filter((r) => r.status === "new").length ?? 0;

  return (
    <div>
      {err && <p className="error">{err}</p>}
      <p className="field-note">
        会員から届いた「会員レベルを変えてほしい」というご依頼です。実際の役割の変更は
        <Link to="/admin/members"> 「会員」タブ </Link>
        の各会員から行ってください。
      </p>

      {newCount > 0 && (
        <h2>
          未対応 <span className="chip chip-red">{newCount}件</span>
        </h2>
      )}
      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <p className="muted">依頼はまだありません。</p>
        </div>
      )}
      {rows?.map((r) => (
        <div className="card" key={r.id}>
          <div className="spread">
            <strong>{r.person_name} さん</strong>
            <span className={`chip ${STATUS_CHIP[r.status] ?? "chip-gray"}`}>
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <p className="pre">{r.message}</p>
          <div className="muted">
            受付: {fmtDateTime(r.created_at)}
            {r.handled_by_name && (
              <>
                {" "}
                ・ 対応: {r.handled_by_name}({fmtDateTime(r.handled_at)})
              </>
            )}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <Link className="btn btn-secondary btn-sm" to="/admin/members">
              会員タブで役割を変更
            </Link>
            {r.status === "new" && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setStatus(r.id, "done")}
                >
                  対応済みにする
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setStatus(r.id, "declined")}
                >
                  見送り
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
