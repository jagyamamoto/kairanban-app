// 入会申込の対応。オーナー指示(2026-07-30)により**町内会と子ども会で画面を分ける**。
// 見える範囲は役割で決まる(officer=町内会 / kodomo_officer=子ども会 /
// senior_officer・admin=両方)。サーバ側でも kind ごとに権限を見ているので、
// タブが見えていない種類を直接叩くと403になる。
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDateTime } from "../../util";

type ChildRow = { name: string; kana: string; gender: string; grade: string; age: string };
type ParentRow = { name: string; kana: string; age: string };
type ApplicationDetail = {
  household_size?: number;
  children?: ChildRow[];
  parents?: ParentRow[];
  line_id?: string;
};

type Application = {
  id: number;
  kind: string;
  name: string;
  kana: string | null;
  phone: string | null;
  address: string | null;
  message: string | null;
  detail: string | null;
  status: string;
  created_at: string;
  handled_by_name: string | null;
  handled_at: string | null;
};

function parseDetail(raw: string | null): ApplicationDetail | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApplicationDetail;
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<string, string> = { chonai: "町内会", kodomo: "子ども会" };
const STATUS_LABEL: Record<string, string> = {
  new: "未対応",
  contacted: "連絡済み",
  done: "完了",
  declined: "見送り",
};
const STATUS_CHIP: Record<string, string> = {
  new: "chip-red",
  contacted: "chip-orange",
  done: "chip-green",
  declined: "chip-gray",
};

export default function ApplicationsAdmin({ kind }: { kind: "chonai" | "kodomo" }) {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ applications: Application[] }>(`/api/admin/applications?kind=${kind}`)
      .then((d) => setRows(d.applications))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    setRows(null);
    setErr("");
    load();
  }, [kind]);

  const newCount = (rows ?? []).filter((a) => a.status === "new").length;

  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/admin/applications/${id}/status`, { body: { status } });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        {KIND_LABEL[kind]}への入会申込
        {rows !== null && (
          <span className={`chip ${newCount ? "chip-red" : "chip-green"}`} style={{ marginLeft: 8 }}>
            未対応 {newCount}
          </span>
        )}
      </h2>
      <div className="card">
        <p className="muted">
          {kind === "kodomo"
            ? "公開ページの「子ども会に入会申込」から届いたものです。子ども会役員と管理者に、アプリの通知とメールでお知らせしています。"
            : "公開ページの「町内会に入会申込」から届いたものです。町内会役員・上級役員・管理者に、アプリの通知とメールでお知らせしています。"}
          <br />
          ご連絡が済んだら状態を更新してください。
        </p>
      </div>
      {err && <p className="error">{err}</p>}
      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <p className="muted">まだ{KIND_LABEL[kind]}への申込はありません。</p>
        </div>
      )}
      {rows?.map((a) => {
        const detail = parseDetail(a.detail);
        return (
        <div className="card" key={a.id}>
          <div className="spread">
            <strong>
              {a.name}
              {a.kana && <span className="muted">({a.kana})</span>}
            </strong>
            <span className="row">
              <span className={`chip ${STATUS_CHIP[a.status] ?? "chip-gray"}`}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            </span>
          </div>
          <div className="muted">
            {a.phone && (
              <>
                電話: {a.phone}
                <br />
              </>
            )}
            {a.address && (
              <>
                住所: {a.address}
                <br />
              </>
            )}
            {detail?.household_size && (
              <>
                世帯人数: {detail.household_size}人
                <br />
              </>
            )}
            {detail?.line_id && (
              <>
                LINE ID: {detail.line_id}
                <br />
              </>
            )}
            {a.message && (
              <>
                備考: {a.message}
                <br />
              </>
            )}
            申込日時: {fmtDateTime(a.created_at)}
            {a.handled_by_name && (
              <>
                {" "}
                ・ 対応: {a.handled_by_name}({fmtDateTime(a.handled_at)})
              </>
            )}
          </div>
          {detail?.children && detail.children.length > 0 && (
            <table className="simple" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>お子様</th>
                  <th>性別</th>
                  <th>学年</th>
                  <th>年齢</th>
                </tr>
              </thead>
              <tbody>
                {detail.children.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.name}
                      {c.kana && <span className="muted">({c.kana})</span>}
                    </td>
                    <td>{c.gender === "female" ? "女" : "男"}</td>
                    <td>{c.grade}</td>
                    <td>{c.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {detail?.parents && detail.parents.length > 0 && (
            <p className="muted" style={{ marginTop: 8 }}>
              お手伝い保護者:{" "}
              {detail.parents
                .map((p) => `${p.name}${p.kana ? `(${p.kana})` : ""}${p.age ? ` ${p.age}歳` : ""}`)
                .join("、")}
            </p>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            {a.status === "new" && (
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(a.id, "contacted")}>
                連絡済みにする
              </button>
            )}
            {a.status !== "done" && (
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(a.id, "done")}>
                完了にする
              </button>
            )}
            {a.status !== "declined" && a.status !== "done" && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setStatus(a.id, "declined")}
              >
                見送りにする
              </button>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
