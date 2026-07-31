// 会員向けの資料置き場。自分の権限で見られるものだけが並ぶ。
// オーナー指示(2026-07-30): 会員が自分で資料を置ける・書ける。既定の公開範囲は
// 「投稿者と同じレベル以上」。あとから変更できる。資料が増えるので検索も付ける。
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../../../shared/labels";
import { api, apiUpload } from "../../api";
import { fmtDate } from "../../util";
import { DOC_CATEGORY_LABELS } from "../../../shared/labels";
import { parseLevels } from "../../../shared/levels";
import { LevelChips, LevelPicker } from "../../LevelPicker";

type Row = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  levels: string; // JSONの配列
  file_name: string | null;
  file_size: number | null;
  doc_date: string | null;
  created_by: number | null;
  created_by_name: string | null;
};

type ListResponse = {
  documents: Row[];
  canPost: boolean;
  selectableLevels: string[];
  defaultLevels: string[];
  myId: number | null;
  canManageAll: boolean;
};

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// 資料を置く/書く。ファイルは任意(本文だけの「書き込み」でもよい)。
function PostForm({
  info,
  onDone,
  onCancel,
}: {
  info: ListResponse;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [levels, setLevels] = useState<string[]>(info.defaultLevels);
  const [docDate, setDocDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>資料を置く・書く</h3>

      <label htmlFor="doc-title">タイトル(必須)</label>
      <input
        id="doc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例: 令和8年度 総会資料"
      />

      <label htmlFor="doc-body">説明・本文(任意)</label>
      <textarea
        id="doc-body"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="ファイルを付けずに、ここに書くだけでも構いません。"
      />

      <label htmlFor="doc-kind">種類</label>
      <select id="doc-kind" value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="doc-docdate">資料の日付(任意)</label>
      <input id="doc-docdate" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />

      <LevelPicker options={info.selectableLevels} value={levels} onChange={setLevels} />
      <p className="field-note">
        はじめは<strong>あなたと同じレベル以上の方だけ</strong>が選ばれています。
      </p>

      <label htmlFor="doc-file">ファイル(任意・20MBまで)</label>
      <input id="doc-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setErr("");
          if (!title.trim()) {
            setErr("タイトルを入力してください");
            return;
          }
          setBusy(true);
          try {
            if (levels.length === 0) {
              setErr("誰が見られるかを1つ以上選んでください");
              setBusy(false);
              return;
            }
            const d = await api<{ document: { id: number } }>("/api/documents", {
              body: { title, description, category, levels, doc_date: docDate || undefined },
            });
            if (file) await apiUpload(`/api/documents/${d.document.id}/file`, file);
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "保存に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        この内容で置く
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>
        やめる
      </button>
    </div>
  );
}

// 公開範囲をあとから変える(投稿者本人と、上級役員・管理者)
function LevelChanger({
  row,
  info,
  onChanged,
}: {
  row: Row;
  info: ListResponse;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<string[]>(parseLevels(row.levels));
  const [err, setErr] = useState("");
  const mine = row.created_by === info.myId;
  if (!mine && !info.canManageAll) return null;

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
        options={info.selectableLevels}
        value={levels}
        onChange={setLevels}
        label="誰が見られるようにしますか"
      />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            setErr("");
            try {
              if (levels.length === 0) {
                setErr("1つ以上選んでください");
                return;
              }
              await api(`/api/documents/${row.id}`, { method: "PUT", body: { levels } });
              setOpen(false);
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "変更に失敗しました");
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

export default function Documents() {
  const [info, setInfo] = useState<ListResponse | null>(null);
  const [q, setQ] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState("");

  const load = (query = q) =>
    api<ListResponse>(`/api/documents?q=${encodeURIComponent(query)}`)
      .then(setInfo)
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));

  useEffect(() => {
    load("");
  }, []);

  const rows = info?.documents ?? null;
  const groups = Object.keys(DOC_CATEGORY_LABELS)
    .map((k) => ({ key: k, items: (rows ?? []).filter((r) => r.category === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <h2>町会の資料</h2>
      <p className="field-note" style={{ marginTop: 0 }}>
        あなたの会員レベルで見られる資料が表示されます。
      </p>

      {/* 資料が増えても探せるように(オーナー指示) */}
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="タイトル・説明・ファイル名で探す"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>
          探す
        </button>
        {q && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setQ("");
              load("");
            }}
          >
            クリア
          </button>
        )}
      </div>

      {err && <p className="error">{err}</p>}

      {info?.canPost && !posting && (
        <button className="btn btn-primary" onClick={() => setPosting(true)}>
          ＋ 資料を置く・書く
        </button>
      )}
      {info && !info.canPost && (
        <p className="field-note">
          資料を置けるのは役員以上の方、または子ども会・{ROLE_LABELS.seniors}の方です。
          置きたい資料がある場合は町会役員までお声がけください。
        </p>
      )}
      {info && posting && (
        <PostForm
          info={info}
          onCancel={() => setPosting(false)}
          onDone={() => {
            setPosting(false);
            load();
          }}
        />
      )}

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <p className="muted">
            {q ? `「${q}」に合う資料はありませんでした。` : "見られる資料はまだありません。"}
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          <h3>{DOC_CATEGORY_LABELS[g.key]}</h3>
          {g.items.map((r) => (
            <div className="card" key={r.id}>
              <div className="spread">
                <strong>{r.title}</strong>
                <LevelChips levels={parseLevels(r.levels)} />
              </div>
              {r.description && (
                <p className="pre" style={{ margin: "6px 0" }}>
                  {r.description}
                </p>
              )}
              <div className="muted" style={{ fontSize: 14 }}>
                {r.doc_date && <>{fmtDate(r.doc_date)} ・ </>}
                {r.created_by_name && <>置いた人: {r.created_by_name}</>}
              </div>
              {r.file_name && (
                <p style={{ margin: "8px 0 0" }}>
                  📎{" "}
                  <a href={`/api/documents/${r.id}/file`} target="_blank" rel="noopener noreferrer">
                    {r.file_name}
                  </a>{" "}
                  <span className="muted">{fmtSize(r.file_size)}</span>
                </p>
              )}
              {info && <LevelChanger row={r} info={info} onChanged={() => load()} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
