// 管理ホーム: 未読・未処理を一括で見る(オーナー指示 2026-07-30)。
// ⚠ 表示されるのは**その人の権限で扱えるものだけ**。件数だけでも中身が推測できるため、
//   権限のない項目はサーバ側で配列に入れずに返している。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useMe } from "../../me";
import { ROLE_LABELS } from "../../../shared/labels";

type DashItem = {
  key: string;
  label: string;
  count: number;
  path: string;
  tone: "red" | "orange" | "green";
  note?: string;
};

const TONE_CHIP: Record<string, string> = {
  red: "chip-red",
  orange: "chip-orange",
  green: "chip-green",
};

export default function AdminHome() {
  const { me } = useMe();
  const [items, setItems] = useState<DashItem[] | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ items: DashItem[] }>("/api/admin/dashboard")
      .then((d) => setItems(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));

  useEffect(() => {
    load();
  }, []);

  const todo = (items ?? []).filter((i) => i.count > 0);
  const clear = (items ?? []).filter((i) => i.count === 0);

  return (
    <div>
      <div className="spread">
        <h2 style={{ margin: "8px 0" }}>いま対応が必要なもの</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>
          更新
        </button>
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>
        {me?.user?.name} さん(
        {(me?.user?.roles ?? []).map((r) => ROLE_LABELS[r] ?? r).join("・")})の権限で
        扱えるものだけを表示しています。
      </p>

      {err && <p className="error">{err}</p>}
      {items === null && <p className="muted">読み込み中…</p>}

      {items !== null && todo.length === 0 && (
        <div className="card center">
          <div className="big-icon">✅</div>
          <p className="ok-note">対応が必要なものはありません。</p>
        </div>
      )}

      {todo.map((i) => (
        <Link
          className="card dash-item"
          key={i.key}
          to={i.path}
          style={{ display: "block", textDecoration: "none", color: "inherit" }}
        >
          <div className="spread">
            <strong>{i.label}</strong>
            <span className={`chip ${TONE_CHIP[i.tone]}`}>{i.count}件</span>
          </div>
          {i.note && <p className="field-note" style={{ margin: "4px 0 0" }}>{i.note}</p>}
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
            開いて対応する →
          </p>
        </Link>
      ))}

      {clear.length > 0 && (
        <details className="card">
          <summary className="muted" style={{ cursor: "pointer" }}>
            片付いているもの({clear.length}件)
          </summary>
          <div style={{ marginTop: 8 }}>
            {clear.map((i) => (
              <div className="spread" key={i.key} style={{ padding: "6px 0" }}>
                <span className="muted">{i.label}</span>
                <span className="chip chip-green">0件</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
