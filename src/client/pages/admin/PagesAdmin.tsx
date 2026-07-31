// 固定ページ管理(町会について・ゴミ出し情報・子ども会など): 作成・編集・公開・翻訳更新
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDateTime } from "../../util";
import { Btn } from "../../Btn";

type Page = {
  id: number;
  slug: string;
  title: string;
  body: string;
  status: string;
  updated_by_name: string;
  updated_at: string;
};

function CreateForm({ onDone }: { onDone: () => void }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label htmlFor="pg-slug">スラッグ(URLの一部・半角英数とハイフンのみ)</label>
      <input
        id="pg-slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="例: garbage / about / kodomo-kai"
      />
      <label htmlFor="pg-title">タイトル</label>
      <input id="pg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: ゴミ出し情報" />
      <label htmlFor="pg-body">本文</label>
      <textarea id="pg-body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 220 }} />
      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          if (!slug.trim() || !title.trim() || !body.trim()) {
            setErr("スラッグ・タイトル・本文を入力してください");
            return;
          }
          setBusy(true);
          try {
            await api("/api/admin/pages", { body: { slug, title, body } });
            setSlug("");
            setTitle("");
            setBody("");
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

function EditForm({ p, onDone, onCancel }: { p: Page; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <label htmlFor="pg-title2">タイトル</label>
      <input id="pg-title2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="pg-body2">本文</label>
      <textarea id="pg-body2" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 220 }} />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <Btn
          className="btn btn-primary btn-sm"
          busy={busy}
          busyLabel="保存中…"
          onClick={async () => {
            if (!title.trim() || !body.trim()) {
              setErr("タイトルと本文は必須です");
              return;
            }
            setBusy(true);
            try {
              await api(`/api/admin/pages/${p.id}`, { method: "PUT", body: { title, body } });
              onDone();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "保存に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Btn>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export default function PagesAdmin() {
  const [rows, setRows] = useState<Page[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    api<{ pages: Page[] }>("/api/admin/pages")
      .then((d) => setRows(d.pages))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/admin/pages/${id}/status`, { body: { status } });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      <div className="card">
        <p className="muted">
          町会について・ゴミ出し情報・子ども会のご案内など、期限のない案内ページを作れます
          (公開すると誰でも見られるページに掲載されます)。
        </p>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok-note">{msg}</p>}
      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 新しいページを作る</summary>
        <CreateForm onDone={load} />
      </details>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows?.map((p) => (
        <div className="card" key={p.id}>
          <div className="spread">
            <strong>{p.title}</strong>
            <span className={`chip ${p.status === "published" ? "chip-green" : "chip-gray"}`}>
              {p.status === "published" ? "公開中" : "下書き"}
            </span>
          </div>
          <div className="muted">
            /{p.slug} ・ 更新: {p.updated_by_name}({fmtDateTime(p.updated_at)})
          </div>
          {editingId === p.id ? (
            <EditForm
              p={p}
              onDone={() => {
                setEditingId(null);
                load();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              {p.status !== "published" && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setStatus(p.id, "published")}
                >
                  公開する
                </button>
              )}
              {p.status === "published" && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setStatus(p.id, "draft")}
                >
                  非公開にする
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(p.id)}>
                編集
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  setMsg("翻訳を更新しています…");
                  await api(`/api/admin/pages/${p.id}/translate`, { body: {} });
                  setMsg("翻訳を更新しました");
                }}
              >
                翻訳を更新
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
