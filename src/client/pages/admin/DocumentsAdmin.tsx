// 資料置き場の管理: 規約・総会/集会の報告資料などの登録・差し替え・公開範囲の変更。
// 重要書類が多いため、新規登録の既定は「役員のみ」。
import { useEffect, useState } from "react";
import { ORG } from "../../../shared/org";
import { api, apiUpload } from "../../api";
import { fmtDate } from "../../util";
import { DOC_CATEGORY_LABELS } from "../../../shared/labels";
import { DOC_LEVELS, LEVEL_LABELS, parseLevels } from "../../../shared/levels";
import { LevelChips, LevelPicker } from "../../LevelPicker";
import { Btn } from "../../Btn";

type Row = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  levels: string; // JSONの配列
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  doc_date: string | null;
  created_by_name: string | null;
  created_at: string;
};

const LEVEL_CHIP: Record<string, string> = {
  officers: "chip-red",
  members: "chip-orange",
  public: "chip-green",
};

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}


type Share = {
  id: number;
  token: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_view_at: string | null;
};

// URL+パスワードでの共有(オーナー依頼: LINEオープンチャットなどに貼る想定)。
// ⚠ これは公開範囲(役員のみ/会員)の制限を**意図的に外す**機能。
//   誤って外に出さないよう、画面上でもはっきり警告を出す。
function ShareBox({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [made, setMade] = useState<{ url: string; password: string; expires_at: string } | null>(
    null,
  );
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const load = () =>
    api<{ shares: Share[] }>(`/api/admin/documents/${r.id}/shares`)
      .then((d) => setShares(d.shares))
      .catch(() => setShares([]));

  useEffect(() => {
    if (open) load();
  }, [open]);

  const living = (shares ?? []).filter(
    (s) => !s.revoked_at && s.expires_at >= new Date().toISOString().slice(0, 10),
  );

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        🔗 URLで共有{shares === null ? "" : living.length ? `(${living.length})` : ""}
      </button>
    );
  }

  return (
    <div className="share-box">
      <div className="spread">
        <strong>🔗 URLとパスワードで共有</strong>
        <button className="linklike" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
      {!parseLevels(r.levels).every((l) => l === "public") && (
        <p className="error" style={{ margin: "6px 0" }}>
          ⚠ この資料は「
          {parseLevels(r.levels).map((l) => LEVEL_LABELS[l] ?? l).join("・")}」です。共有リンクを渡した人は、
          会員でなくても中身を見られます。送り先をよくご確認ください。
        </p>
      )}
      {!r.file_key && <p className="error">先にファイルを添付してください。</p>}

      {made && (
        <div className="share-made">
          <p className="ok-note" style={{ marginTop: 0 }}>
            共有リンクを作りました。<b>パスワードはこの画面でしか見られません。</b>
          </p>
          <label htmlFor="adoc-url">URL</label>
          <input id="adoc-url" readOnly value={made.url} onFocus={(e) => e.currentTarget.select()} />
          <label htmlFor="adoc-password">パスワード</label>
          <input id="adoc-password" readOnly value={made.password} onFocus={(e) => e.currentTarget.select()} />
          <p className="field-note">有効期限: {fmtDate(made.expires_at)}</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              const text = `【${r.title}】\n${made.url}\nパスワード: ${made.password}\n(${fmtDate(made.expires_at)}まで)`;
              try {
                await navigator.clipboard.writeText(text);
                setCopied("コピーしました。オープンチャットに貼り付けてください。");
              } catch {
                setCopied("コピーできませんでした。上の欄を選んでコピーしてください。");
              }
            }}
          >
            URLとパスワードをまとめてコピー
          </button>
          {copied && <p className="ok-note">{copied}</p>}
        </div>
      )}

      {!made && (
        <>
          <label htmlFor="adoc-label">用途のメモ(任意)</label>
          <input
            id="adoc-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: 七北町会連絡網に共有"
          />
          <label htmlFor="adoc-days">有効期限</label>
          <select id="adoc-days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7日</option>
            <option value="30">30日</option>
            <option value="90">90日</option>
            <option value="180">180日</option>
          </select>
          <p className="field-note">
            パスワードは読み上げやすいものを自動で作ります。期限が来ると自動で開けなくなります。
          </p>
          {err && <p className="error">{err}</p>}
          <button
            className="btn btn-primary btn-sm"
            disabled={!r.file_key}
            onClick={async () => {
              setErr("");
              try {
                const d = await api<{
                  share: { expires_at: string };
                  password: string;
                  url: string;
                }>(`/api/admin/documents/${r.id}/shares`, {
                  body: { label, days: Number(days) },
                });
                setMade({
                  url: `${window.location.origin}${d.url}`,
                  password: d.password,
                  expires_at: d.share.expires_at,
                });
                load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "作成に失敗しました");
              }
            }}
          >
            共有リンクを作る
          </button>
        </>
      )}

      {shares !== null && shares.length > 0 && (
        <>
          <hr className="hr-soft" />
          <strong>これまでに作ったリンク</strong>
          {shares.map((s) => {
            const dead = !!s.revoked_at || s.expires_at < new Date().toISOString().slice(0, 10);
            return (
              <div className="spread share-row" key={s.id}>
                <span className={dead ? "muted" : ""}>
                  {s.label || "(メモなし)"} ・ {fmtDate(s.expires_at)}まで ・ {s.view_count}回閲覧
                  {s.revoked_at && " ・ 停止済み"}
                  {!s.revoked_at && dead && " ・ 期限切れ"}
                </span>
                {!dead && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!window.confirm("このリンクを使えなくしますか?")) return;
                      await api(`/api/admin/documents/shares/${s.id}/revoke`, { body: {} });
                      load();
                      setMade(null);
                    }}
                  >
                    停止
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("rules");
  const [levels, setLevels] = useState<string[]>(["officers"]); // 既定は役員のみ
  const [docDate, setDocDate] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <label htmlFor="adoc-title">資料の名前(必須)</label>
      <input
        id="adoc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`例: ${ORG.name} 規約`}
      />
      <label htmlFor="adoc-description">説明(任意)</label>
      <input
        id="adoc-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="例: 令和8年度総会で改定"
      />
      <label htmlFor="adoc-category">種類</label>
      <select id="adoc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label htmlFor="adoc-doc-date">資料の日付(任意・総会の開催日など)</label>
      <input id="adoc-doc-date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />

      <LevelPicker options={DOC_LEVELS} value={levels} onChange={setLevels} />
      <p className="field-note">
        重要書類が多いため、はじめは<strong>「役員以上」</strong>だけが選ばれています。
        会員や一般の方にも見せる場合だけ追加してください。
      </p>

      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          setErr("");
          if (!title.trim()) {
            setErr("資料の名前を入力してください");
            return;
          }
          setBusy(true);
          try {
            await api("/api/admin/documents", {
              body: {
                title,
                description: description || undefined,
                category,
                levels,
                doc_date: docDate || undefined,
              },
            });
            setTitle("");
            setDescription("");
            setDocDate("");
            setLevels(["officers"]);
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "登録に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        登録する(このあとファイルを添付します)
      </Btn>
    </div>
  );
}

function LevelBox({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<string[]>(parseLevels(r.levels));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        公開範囲を変える
      </button>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <LevelPicker
        options={DOC_LEVELS}
        value={levels}
        onChange={setLevels}
        label="誰が見られるようにしますか"
      />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || levels.length === 0}
          onClick={async () => {
            setErr("");
            setBusy(true);
            try {
              await api(`/api/admin/documents/${r.id}`, { method: "PUT", body: { levels } });
              setOpen(false);
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "変更に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          変更する
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </div>
  );
}

export default function DocumentsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ documents: Row[] }>("/api/admin/documents")
      .then((d) => setRows(d.documents))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
        setRows([]);
      });
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      {err && <p className="error">{err}</p>}
      <p className="field-note">
        規約や総会・集会の報告資料などを置く場所です。公開範囲は資料ごとに変えられます。
      </p>

      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 資料を追加する</summary>
        <CreateForm onDone={load} />
      </details>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <p className="muted">まだ資料がありません。</p>
        </div>
      )}
      {rows?.map((r) => (
        <div className="card" key={r.id}>
          <div className="spread">
            <strong>{r.title}</strong>
            <LevelChips levels={parseLevels(r.levels)} />
          </div>
          <div className="muted">
            {DOC_CATEGORY_LABELS[r.category] ?? r.category}
            {r.doc_date && <> ・ {fmtDate(r.doc_date)}</>}
            {r.created_by_name && <> ・ 登録: {r.created_by_name}</>}
            {r.description && (
              <>
                <br />
                {r.description}
              </>
            )}
          </div>

          {r.file_key ? (
            <p style={{ margin: "8px 0 0" }}>
              📎{" "}
              <a href={`/api/documents/${r.id}/file`} target="_blank" rel="noopener noreferrer">
                {r.file_name || "ファイルを開く"}
              </a>{" "}
              <span className="muted">{fmtSize(r.file_size)}</span>
            </p>
          ) : (
            <p className="error" style={{ margin: "8px 0 0" }}>
              ファイル未添付
            </p>
          )}

          <LevelBox r={r} onChanged={load} />
          <ShareBox r={r} />

          <div className="row" style={{ marginTop: 6 }}>
            <label
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-block", cursor: "pointer", margin: 0 }}
            >
              {r.file_key ? "ファイルを差し替え" : "ファイルを添付"}
              <input
                type="file"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    await apiUpload(`/api/admin/documents/${r.id}/file`, f);
                    load();
                  } catch (err2) {
                    setErr(err2 instanceof Error ? err2.message : "アップロードに失敗しました");
                  }
                }}
              />
            </label>
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm(`「${r.title}」を削除しますか?`)) return;
                try {
                  await api(`/api/admin/documents/${r.id}`, { method: "DELETE" });
                  load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "削除に失敗しました");
                }
              }}
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
