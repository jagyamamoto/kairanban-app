// ブログ(夏祭り・子ども会などの写真共有)。オーナー指示 2026-07-30。
// 「写真アルバム」→「ブログ」に名称変更(2026-07-30)。
//
// ⚠ **一般公開は絶対にしない**。選べる公開範囲に「どなたでも」が入っていないのは
//   肖像権・個人情報のため(サーバ側の POST_LEVELS でも弾いている)。
//   写真そのものも権限チェックを通してから配信される。
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../../../shared/labels";
import { api, apiUpload } from "../../api";
import { fmtDate } from "../../util";
import { parseLevels } from "../../../shared/levels";
import { LevelChips, LevelPicker } from "../../LevelPicker";
import { Btn } from "../../Btn";

type PostRow = {
  id: number;
  title: string;
  body: string | null;
  levels: string; // JSONの配列
  event_date: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  photo_count: number;
  cover_id: number | null;
};

type ListResponse = {
  posts: PostRow[];
  selectableLevels: string[];
  defaultLevels: string[];
  canPost: boolean;
  myId: number | null;
  canManageAll: boolean;
};

type Photo = { id: number; caption: string | null; file_name: string | null; sort: number };

// 撮った写真を載せる前に読んでほしいこと。コンプライアンス上いちばん大事な部分。
function PhotoCaution() {
  return (
    <div className="card card-warn">
      <strong>📷 写真を載せるときのお願い</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: "1.2em", lineHeight: 1.8 }}>
        <li>
          <strong>この写真は一般公開されません。</strong>
          選んだ会員レベルの方だけが見られます。
        </li>
        <li>
          写っている方に<strong>「町会のアプリに載せてよいか」</strong>をご確認ください。
          とくにお子様は保護者の方に。
        </li>
        <li>お名前・学校名・車のナンバー・表札・住所が読み取れる写真は避けてください。</li>
        <li>
          「載せないでほしい」と言われたら、投稿者か役員がすぐ消せます。遠慮なくお申し出ください。
        </li>
      </ul>
    </div>
  );
}

function NewPostForm({
  info,
  onDone,
  onCancel,
}: {
  info: ListResponse;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [levels, setLevels] = useState<string[]>(info.defaultLevels);
  const [eventDate, setEventDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>写真・記事を投稿する</h3>

      <label htmlFor="blog-title">タイトル(必須)</label>
      <input id="blog-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 令和8年 夏祭り" />

      <label htmlFor="blog-note">ひとこと・説明(任意)</label>
      <textarea id="blog-note" value={body} onChange={(e) => setBody(e.target.value)} />

      <label htmlFor="blog-eventdate">行事の日付(任意)</label>
      <input id="blog-eventdate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

      <LevelPicker options={info.selectableLevels} value={levels} onChange={setLevels} />
      <p className="field-note">
        <strong>「どなたでも(一般公開)」は選べません。</strong>写真は町会の中だけで共有します。
      </p>

      <label htmlFor="blog-photos">写真(1枚10MBまで・まとめて選べます)</label>
      <input
        id="blog-photos"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && <p className="field-note">{files.length}枚を選びました。</p>}

      {err && <p className="error">{err}</p>}
      {progress && <p className="ok-note">{progress}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="送っています…"
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
            const d = await api<{ post: { id: number } }>("/api/posts", {
              body: { title, body, levels, event_date: eventDate || undefined },
            });
            let done = 0;
            for (const f of files) {
              await apiUpload(`/api/posts/${d.post.id}/photos`, f);
              done++;
              setProgress(`${done} / ${files.length} 枚を送りました`);
            }
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "投稿に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        この内容で投稿する
      </Btn>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>
        やめる
      </button>
    </div>
  );
}

function PostDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<{
    post: PostRow;
    photos: Photo[];
    canEdit: boolean;
  } | null>(null);
  const [info, setInfo] = useState<ListResponse | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () =>
    api<{ post: PostRow; photos: Photo[]; canEdit: boolean }>(`/api/posts/${id}`)
      .then((d) => {
        setData(d);
        setLevels(parseLevels(d.post.levels));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));

  useEffect(() => {
    load();
    api<ListResponse>("/api/posts").then(setInfo).catch(() => {});
  }, [id]);

  if (err) {
    return (
      <div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          ← もどる
        </button>
        <p className="error">{err}</p>
      </div>
    );
  }
  if (!data) return <p className="muted">読み込み中…</p>;
  const { post, photos, canEdit } = data;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={onBack}>
        ← ブログ一覧
      </button>
      <div className="card">
        <div className="spread">
          <strong style={{ fontSize: 20 }}>{post.title}</strong>
          <LevelChips levels={parseLevels(post.levels)} />
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {post.event_date && <>{fmtDate(post.event_date)} ・ </>}
          {post.created_by_name && <>投稿: {post.created_by_name}</>}
        </div>
        {post.body && (
          <p className="pre" style={{ margin: "8px 0 0" }}>
            {post.body}
          </p>
        )}
      </div>

      {canEdit && info && (
        <div className="card">
          <LevelPicker
            options={info.selectableLevels}
            value={levels}
            onChange={setLevels}
            label="公開範囲を変える"
          />
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              disabled={levels.length === 0}
              onClick={async () => {
                await api(`/api/posts/${id}`, { method: "PUT", body: { levels } });
                load();
              }}
            >
              変更する
            </button>
            <label className="btn btn-secondary btn-sm" style={{ margin: 0, cursor: "pointer" }}>
              写真を追加
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={async (e) => {
                  const fs = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!fs.length) return;
                  setAdding(true);
                  try {
                    for (const f of fs) await apiUpload(`/api/posts/${id}/photos`, f);
                    load();
                  } catch (e2) {
                    setErr(e2 instanceof Error ? e2.message : "追加に失敗しました");
                  } finally {
                    setAdding(false);
                  }
                }}
              />
            </label>
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm(`「${post.title}」を写真ごと消しますか?`)) return;
                await api(`/api/posts/${id}`, { method: "DELETE" });
                onBack();
              }}
            >
              この投稿を消す
            </button>
          </div>
          {adding && <p className="muted">写真を送っています…</p>}
        </div>
      )}

      {photos.length === 0 && (
        <div className="card">
          <p className="muted">写真はまだありません。</p>
        </div>
      )}
      <div className="photo-grid">
        {photos.map((ph) => (
          <div className="photo-cell" key={ph.id}>
            <a href={`/api/posts/photos/${ph.id}`} target="_blank" rel="noopener noreferrer">
              <img src={`/api/posts/photos/${ph.id}`} alt={ph.caption || ""} loading="lazy" />
            </a>
            {canEdit && (
              <button
                className="photo-del"
                aria-label="この写真を消す"
                onClick={async () => {
                  if (!window.confirm("この写真を消しますか?")) return;
                  await api(`/api/posts/photos/${ph.id}`, { method: "DELETE" });
                  load();
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Album() {
  const [info, setInfo] = useState<ListResponse | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const load = (query = q) =>
    api<ListResponse>(`/api/posts?q=${encodeURIComponent(query)}`)
      .then(setInfo)
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));

  useEffect(() => {
    load("");
  }, []);

  if (openId != null) {
    return (
      <PostDetail
        id={openId}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <h2>ブログ</h2>
      <p className="field-note" style={{ marginTop: 0 }}>
        夏祭り・子ども会などの写真と記事です。<strong>一般公開はしていません。</strong>
        あなたの会員レベルで見られるものだけが並びます。
      </p>

      <div className="row" style={{ marginBottom: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="行事の名前で探す"
          style={{ flex: 1, minWidth: 160 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>
          探す
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {info?.canPost && !creating && (
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ 写真・記事を投稿する
        </button>
      )}
      {info && !info.canPost && (
        <p className="field-note">
          投稿できるのは役員以上の方、または子ども会・{ROLE_LABELS.seniors}の方です。
          載せたい写真がある場合は町会役員までお声がけください。
        </p>
      )}
      {creating && info && (
        <>
          <PhotoCaution />
          <NewPostForm
            info={info}
            onCancel={() => setCreating(false)}
            onDone={() => {
              setCreating(false);
              load();
            }}
          />
        </>
      )}

      {info === null && <p className="muted">読み込み中…</p>}
      {info !== null && info.posts.length === 0 && (
        <div className="card">
          <p className="muted">
            {q ? `「${q}」に合う記事はありませんでした。` : "記事はまだありません。"}
          </p>
        </div>
      )}

      {info?.posts.map((p) => (
        <div
          className="card"
          key={p.id}
          style={{ cursor: "pointer" }}
          onClick={() => setOpenId(p.id)}
        >
          <div className="spread">
            <strong>{p.title}</strong>
            <LevelChips levels={parseLevels(p.levels)} />
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            {p.event_date && <>{fmtDate(p.event_date)} ・ </>}
            写真 {p.photo_count}枚
            {p.created_by_name && <> ・ 投稿: {p.created_by_name}</>}
          </div>
          {p.cover_id && (
            <img
              className="album-cover"
              src={`/api/posts/photos/${p.cover_id}`}
              alt=""
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}
