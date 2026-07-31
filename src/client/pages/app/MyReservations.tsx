// 自分の予約一覧と取消
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { fmtDate } from "../../util";
import { RESERVATION_STATUS_LABELS } from "../../../shared/labels";

type Row = {
  id: number;
  case_no: string;
  org_name: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: string;
  status_reason: string | null;
  repeat_group: string | null;
};

const CHIP: Record<string, string> = {
  received: "chip-gray",
  checking: "chip-orange",
  approved: "chip-green",
  rejected: "chip-red",
  cancelled: "chip-gray",
  done: "chip-gray",
};

// 同じくりかえしグループで、まだ有効な予約の件数
function groupCount(rows: Row[] | null, group: string | null): number {
  if (!rows || !group) return 0;
  return rows.filter(
    (x) => x.repeat_group === group && ["received", "checking", "approved"].includes(x.status),
  ).length;
}

export default function MyReservations() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ reservations: Row[] }>("/api/reservations/mine")
      .then((d) => setRows(d.reservations))
      .catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>自分の予約</h2>
      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <p>予約はまだありません。</p>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {rows?.map((r) => (
        <div className="card" key={r.id}>
          <div className="spread">
            <strong>
              {fmtDate(r.date)} {r.start_time}〜{r.end_time}
            </strong>
            <span className={`chip ${CHIP[r.status] ?? "chip-gray"}`}>
              {RESERVATION_STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <div className="muted">
            {r.case_no} ・ {r.org_name} ・ {r.purpose}
          </div>
          {r.status === "rejected" && r.status_reason && (
            <p className="error">差戻し理由: {r.status_reason}</p>
          )}
          {r.repeat_group && groupCount(rows, r.repeat_group) > 1 && (
            <p className="field-note">
              くりかえし予約({groupCount(rows, r.repeat_group)}件)のうちの1件です。
            </p>
          )}
          {["received", "checking", "approved"].includes(r.status) && (
            <div className="row">
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!window.confirm("この予約を取り消しますか?")) return;
                  try {
                    await api(`/api/reservations/${r.id}/cancel`, { body: {} });
                    await load();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "取消に失敗しました");
                  }
                }}
              >
                この日だけ取り消す
              </button>
              {r.repeat_group && groupCount(rows, r.repeat_group) > 1 && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    const n = groupCount(rows, r.repeat_group);
                    if (!window.confirm(`くりかえし予約${n}件をまとめて取り消しますか?`)) return;
                    try {
                      await api(`/api/reservations/repeat/${r.repeat_group}/cancel`, { body: {} });
                      await load();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "取消に失敗しました");
                    }
                  }}
                >
                  くりかえしをまとめて取り消す
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <Link className="btn btn-primary" to="/app/reserve">
        新しく予約する
      </Link>
    </div>
  );
}
