// 回覧管理: 作成・承認・公開・確認状況・代理確認・リマインド・翻訳
import { useEffect, useState } from "react";
import { api, apiUpload } from "../../api";
import { useMe } from "../../me";
import { fmtDate, fmtDateTime } from "../../util";
import {
  AUDIENCE_LABELS,
  CIRCULAR_STATUS_LABELS,
  VISIBILITY_LABELS,
  audienceLabel,
} from "../../../shared/labels";
import { Btn } from "../../Btn";

type Row = {
  id: number;
  case_no: string;
  title: string;
  body: string;
  audience: string;
  visibility: string;
  deadline: string | null;
  publish_start_date: string | null;
  publish_end_date: string | null;
  event_date: string | null;
  status: string;
  image_key: string | null;
  created_by_name: string;
  published_at: string | null;
  confirmed_count: number;
};

type StatusData = {
  targets: {
    person_id: number;
    name: string;
    is_digital: number;
    notifiable: boolean;
    opened_at: string | null;
    confirmed_at: string | null;
    method: string | null;
    proxy_name: string | null;
  }[];
  counts: { total: number; confirmed: number; unconfirmed: number };
};

const STATUS_CHIP: Record<string, string> = {
  draft: "chip-gray",
  pending_approval: "chip-orange",
  published: "chip-green",
  archived: "chip-gray",
};

// 公開先の選択肢(複数選択可・オーナー指示)。
// 「全員(公開)」「会員のみ」は掲載範囲(visibility)、「役員のみ」「子ども会」は
// 会員アプリ内での配信先(audience)の絞り込みなので、内部的には別項目に変換して保存する。
const SCOPE_PUBLIC = "public";
const SCOPE_MEMBERS = "members";
const NARROW_OPTIONS: { key: string; label: string }[] = [
  { key: "officers", label: AUDIENCE_LABELS.officers },
  { key: "kodomo", label: AUDIENCE_LABELS.kodomo },
  { key: "seniors", label: AUDIENCE_LABELS.seniors },
];
// 全対象を管理できる役割(管理閲覧権限.xlsx)。それ以外は自分の担当分だけに絞り込みを固定する。
const BROAD_MANAGE_ROLES = ["admin", "senior_officer", "pr", "circular_manager"];

// audience+visibility ⇔ チェックボックスの状態の相互変換
function scopeFromVisibility(visibility: string): string[] {
  if (visibility === "both") return [SCOPE_PUBLIC, SCOPE_MEMBERS];
  if (visibility === "public") return [SCOPE_PUBLIC];
  return [SCOPE_MEMBERS];
}
function visibilityFromScope(scope: string[]): string {
  const pub = scope.includes(SCOPE_PUBLIC);
  const mem = scope.includes(SCOPE_MEMBERS);
  return pub && mem ? "both" : pub ? "public" : "members";
}
function allowedNarrowFor(roles: string[]) {
  const isBroad = roles.some((r) => BROAD_MANAGE_ROLES.includes(r));
  const keys = isBroad
    ? ["officers", "kodomo", "seniors"]
    : [
        ...(roles.includes("officer") ? ["officers", "seniors"] : []),
        ...(roles.includes("kodomo_officer") ? ["kodomo"] : []),
      ];
  return { isBroad, options: NARROW_OPTIONS.filter((o) => keys.includes(o.key)) };
}

// 公開先チェックボックス群(作成フォームと承認前の変更欄で共有)
function ScopeChecks({
  scope,
  narrow,
  isBroad,
  options,
  onToggleScope,
  onChooseNarrow,
}: {
  scope: string[];
  narrow: string;
  isBroad: boolean;
  options: { key: string; label: string }[];
  onToggleScope: (key: string) => void;
  onChooseNarrow: (key: string) => void;
}) {
  return (
    <>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={scope.includes(SCOPE_PUBLIC)}
          onChange={() => onToggleScope(SCOPE_PUBLIC)}
        />
        全員(公開) — 会員でない地域の方も見られる公開ページに掲載
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={scope.includes(SCOPE_MEMBERS)}
          onChange={() => onToggleScope(SCOPE_MEMBERS)}
        />
        会員のみ — 会員アプリの確認一覧・通知に掲載
      </label>
      {options.map((o) => (
        <label className="checkbox-row" key={o.key}>
          <input type="checkbox" checked={narrow === o.key} onChange={() => onChooseNarrow(o.key)} />
          {o.label} — 会員のうち{o.label}だけに絞る
        </label>
      ))}
      {!isBroad && (
        <p className="field-note">あなたの役割では、担当する対象のどれかを必ず選ぶ必要があります。</p>
      )}
    </>
  );
}

// 承認・公開の前に公開先を変更する欄(オーナー指示: 承認時に「子ども会だけ」「会員だけ」等を決めたい)
function ScopeBox({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const { me } = useMe();
  const { isBroad, options } = allowedNarrowFor(me?.user?.roles ?? []);
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<string[]>(() => scopeFromVisibility(r.visibility));
  const [narrow, setNarrow] = useState(r.audience === "all" ? "" : r.audience);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        公開先: {audienceLabel(r.audience)} ・ {VISIBILITY_LABELS[r.visibility] ?? r.visibility}{" "}
        <button
          className="btn btn-secondary btn-sm"
          style={{ margin: "0 0 0 6px", padding: "2px 8px" }}
          onClick={() => {
            setScope(scopeFromVisibility(r.visibility));
            setNarrow(r.audience === "all" ? "" : r.audience);
            setErr("");
            setEditing(true);
          }}
        >
          公開先を変える
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <p className="group-label">公開先(複数選択可)</p>
      <ScopeChecks
        scope={scope}
        narrow={narrow}
        isBroad={isBroad}
        options={options}
        onToggleScope={(k) =>
          setScope((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
        }
        onChooseNarrow={(k) => setNarrow((prev) => (isBroad && prev === k ? "" : k))}
      />
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ marginTop: 6 }}>
        <Btn
          className="btn btn-primary btn-sm"
          busy={busy}
          busyLabel="保存中…"
          onClick={async () => {
            if (scope.length === 0) {
              setErr("公開先を1つ以上選んでください");
              return;
            }
            setBusy(true);
            setErr("");
            try {
              await api(`/api/admin/circulars/${r.id}/scope`, {
                method: "PUT",
                body: { audience: narrow || "all", visibility: visibilityFromScope(scope) },
              });
              setEditing(false);
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "保存に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Btn>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          取消
        </button>
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { me } = useMe();
  const roles = me?.user?.roles ?? [];
  const { isBroad, options: allowedNarrow } = allowedNarrowFor(roles);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<string[]>([SCOPE_MEMBERS]);
  // "" = 絞り込みなし(全員)。役員向け回覧管理を持たない役割(町内会役員・子ども会役員)は
  // 「全員」を管理できないため、担当分のどれかを必ず選んだ状態から始める。
  const [narrow, setNarrow] = useState<string>(isBroad ? "" : (allowedNarrow[0]?.key ?? ""));
  const [deadline, setDeadline] = useState("");
  const [publishStart, setPublishStart] = useState("");
  const [publishEnd, setPublishEnd] = useState("");
  // 行事の実施日(任意)。7日前・前日・当日に自動でお知らせが飛ぶ
  const [eventDate, setEventDate] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleScope = (key: string) => {
    setScope((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const chooseNarrow = (key: string) => {
    // 担当が限られる役割は必ずどれか1つを選んだ状態にする(空=全員は選べない)
    setNarrow((prev) => (isBroad && prev === key ? "" : key));
  };

  return (
    <div>
      <label htmlFor="cir-title">タイトル</label>
      <input id="cir-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="cir-body">本文</label>
      <textarea id="cir-body" value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="group-label">公開先(複数選択可)</p>
      <ScopeChecks
        scope={scope}
        narrow={narrow}
        isBroad={isBroad}
        options={allowedNarrow}
        onToggleScope={toggleScope}
        onChooseNarrow={chooseNarrow}
      />
      <p className="field-note">
        「全員(公開)」のみだと会員アプリには出ません(公開ページだけ)。「全員(公開)」を
        自動で多言語翻訳します。絞り込みは会員のみの時に使います。公開先は承認前ならあとから変更できます。
      </p>
      <label htmlFor="cir-deadline">確認期限(任意・会員向けの時に使用)</label>
      <input id="cir-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <div className="recommend-box" style={{ background: "#f7f9fb", borderColor: "#c8d6e0" }}>
        <label style={{ marginTop: 0 }} htmlFor="cir-event-date">行事の実施日(任意)</label>
        <input id="cir-event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        <p className="field-note">
          お祭りや清掃など<strong>実施日がある行事</strong>のときに入れてください。
          <br />
          入れておくと、対象の会員に<strong>7日前・前日・当日の朝</strong>に自動でお知らせが届きます
          (通知とメール)。お知らせだけの回覧なら空のままで構いません。
        </p>
      </div>

      <label htmlFor="cir-publish-start">掲載開始日(任意)</label>
      <input id="cir-publish-start" type="date" value={publishStart} onChange={(e) => setPublishStart(e.target.value)} />
      <label htmlFor="cir-publish-end">掲載終了日(任意・この日の23:59まで掲載)</label>
      <input id="cir-publish-end" type="date" value={publishEnd} onChange={(e) => setPublishEnd(e.target.value)} />
      <p className="field-note">
        <strong>掲載終了日に入れた日は、その日いっぱい(23:59まで)掲載されます。</strong>
        翌日になると自動的に「記録」へ移ります。
        <br />
        未設定の場合は公開から1週間で自動的に記録へ移ります(公開後でも変更できます)。
      </p>
      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          if (scope.length === 0) {
            setErr("公開先を1つ以上選んでください");
            return;
          }
          setBusy(true);
          try {
            const visibility = visibilityFromScope(scope);
            const audience = narrow || "all";
            await api("/api/admin/circulars", {
              body: {
                title,
                body,
                audience,
                visibility,
                deadline: deadline || undefined,
                publish_start_date: publishStart || undefined,
                publish_end_date: publishEnd || undefined,
                event_date: eventDate || undefined,
              },
            });
            setTitle("");
            setBody("");
            setDeadline("");
            setPublishStart("");
            setPublishEnd("");
            setScope([SCOPE_MEMBERS]);
            setNarrow("");
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

function ImageBox({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      {r.image_key && (
        <img
          src={`/api/images/circular/${r.id}`}
          alt=""
          style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, display: "block", marginBottom: 6 }}
        />
      )}
      {err && <p className="error">{err}</p>}
      <label className="btn btn-secondary btn-sm" style={{ display: "inline-block", cursor: "pointer" }}>
        {r.image_key ? "画像を差し替え" : "画像を追加"}
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setErr("");
            try {
              await apiUpload(`/api/admin/circulars/${r.id}/image`, file);
              onChanged();
            } catch (err2) {
              setErr(err2 instanceof Error ? err2.message : "アップロードに失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {r.image_key && (
        <Btn
          className="btn btn-secondary btn-sm"
          busy={busy}
          busyLabel="削除中…"
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/admin/circulars/${r.id}/image`, { method: "DELETE" });
              onChanged();
            } catch (err2) {
              setErr(err2 instanceof Error ? err2.message : "削除に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          画像を削除
        </Btn>
      )}
    </div>
  );
}

// 掲載開始日・掲載終了日をいつでも調整できる欄(公開中・記録済みでも変更可)
function DatesBox({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(r.publish_start_date ?? "");
  const [end, setEnd] = useState(r.publish_end_date ?? "");
  const [event, setEvent] = useState(r.event_date ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        掲載期間: {r.publish_start_date ? fmtDate(r.publish_start_date) : "未設定"} 〜{" "}
        {r.publish_end_date
          ? `${fmtDate(r.publish_end_date)} 23:59まで`
          : "未設定(公開から1週間で自動的に記録へ)"}
        {r.event_date && (
          <>
            <br />
            実施日: <strong>{fmtDate(r.event_date)}</strong>
            (7日前・前日・当日にお知らせ)
          </>
        )}{" "}
        <button
          className="btn btn-secondary btn-sm"
          style={{ margin: "0 0 0 6px", padding: "2px 8px" }}
          onClick={() => {
            setStart(r.publish_start_date ?? "");
            setEnd(r.publish_end_date ?? "");
            setEvent(r.event_date ?? "");
            setEditing(true);
          }}
        >
          変更
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <label htmlFor="cir-start">掲載開始日(任意)</label>
      <input id="cir-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      <label htmlFor="cir-end">掲載終了日(任意・この日の23:59まで掲載)</label>
      <input id="cir-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      <p className="field-note">
        入れた日は<strong>その日いっぱい掲載</strong>され、翌日に「記録」へ移ります。
        未設定なら公開から1週間で記録へ移ります。
      </p>
      <label htmlFor="cir-event">行事の実施日(任意)</label>
      <input id="cir-event" type="date" value={event} onChange={(e) => setEvent(e.target.value)} />
      <p className="field-note">
        入れると<strong>7日前・前日・当日の朝</strong>に自動でお知らせが届きます。
        日付を変えると、お知らせは新しい日付で送り直されます。
      </p>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ marginTop: 6 }}>
        <Btn
          className="btn btn-primary btn-sm"
          busy={busy}
          busyLabel="保存中…"
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await api(`/api/admin/circulars/${r.id}/dates`, {
                method: "PUT",
                body: {
                  publish_start_date: start || null,
                  publish_end_date: end || null,
                  event_date: event || null,
                },
              });
              setEditing(false);
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "保存に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Btn>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          取消
        </button>
      </div>
    </div>
  );
}

function StatusView({ id }: { id: number }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const load = () =>
    api<StatusData>(`/api/admin/circulars/${id}/status`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;

  const proxy = async (personId: number, method: "paper" | "phone") => {
    await api(`/api/admin/circulars/${id}/proxy-confirm`, {
      body: { person_id: personId, method },
    });
    await load();
  };

  return (
    <div style={{ marginTop: 10 }}>
      <p>
        対象 {data.counts.total}名 / 確認済み{" "}
        <strong className="ok-note">{data.counts.confirmed}名</strong> / 未確認{" "}
        <strong className={data.counts.unconfirmed ? "error" : ""}>
          {data.counts.unconfirmed}名
        </strong>
      </p>
      {msg && <p className="ok-note">{msg}</p>}
      <button
        className="btn btn-secondary btn-sm"
        onClick={async () => {
          if (!window.confirm("未確認の方へLINEでリマインドを送りますか?(無料枠を消費します)"))
            return;
          const r = await api<{ sent: number; skipped: number }>(
            `/api/admin/circulars/${id}/remind`,
            { body: {} },
          );
          setMsg(`リマインド送信: ${r.sent}件(送れなかった方: ${r.skipped}件)`);
          await load();
        }}
      >
        未確認者へリマインド
      </button>
      <table className="simple" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>名前</th>
            <th>状態</th>
            <th>代理確認</th>
          </tr>
        </thead>
        <tbody>
          {data.targets.map((t) => (
            <tr key={t.person_id}>
              <td>
                {t.name}
                {!t.notifiable && <span className="chip chip-orange">通知不可</span>}
              </td>
              <td>
                {t.confirmed_at ? (
                  <span className="ok-note">
                    ✓ {fmtDateTime(t.confirmed_at)}
                    {t.proxy_name && (
                      <span className="muted">
                        ({t.method === "phone" ? "電話" : "紙"}・{t.proxy_name}記録)
                      </span>
                    )}
                  </span>
                ) : t.opened_at ? (
                  <span className="muted">開いたのみ</span>
                ) : (
                  <span className="error">未確認</span>
                )}
              </td>
              <td>
                {!t.confirmed_at && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => proxy(t.person_id, "paper")}>
                      紙
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => proxy(t.person_id, "phone")}>
                      電話
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CircularsAdmin() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [usage, setUsage] = useState<{ month: string; sent: number; freeLimit: number } | null>(
    null,
  );
  const [openStatus, setOpenStatus] = useState<number | null>(null);
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const roles = me?.user?.roles ?? [];
  // 対象(audience)ごとの権限(管理閲覧権限.xlsxに合わせたスコープ。サーバ側でも同じ判定を行う)
  // 作成・編集(下書きまで): pr・回覧担当も含む
  const canDraft = (r: Row) => {
    if (roles.some((x) => BROAD_MANAGE_ROLES.includes(x))) return true;
    if (roles.includes("officer") && ["officers", "seniors"].includes(r.audience)) return true;
    if (roles.includes("kodomo_officer") && r.audience === "kodomo") return true;
    return false;
  };
  // 承認・公開・終了: pr・回覧担当は不可(従来通り上級役員の承認が必要)
  const canApprove = (r: Row) => {
    if (roles.some((x) => ["admin", "senior_officer"].includes(x))) return true;
    if (roles.includes("officer") && ["officers", "seniors"].includes(r.audience)) return true;
    if (roles.includes("kodomo_officer") && r.audience === "kodomo") return true;
    return false;
  };

  const load = () => {
    api<{ circulars: Row[] }>("/api/admin/circulars")
      .then((d) => setRows(d.circulars))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
    api<{ month: string; sent: number; freeLimit: number }>("/api/admin/notifications/usage")
      .then(setUsage)
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (path: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await api(path, { body: {} });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      {usage && (
        <p className="muted">
          今月のLINE通知: {usage.sent} / {usage.freeLimit}通(無料枠)
        </p>
      )}
      {err && <p className="error">{err}</p>}

      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 新しい回覧を作る</summary>
        <CreateForm onDone={load} />
      </details>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows?.map((r) => (
        <div className="card" key={r.id}>
          <div className="spread">
            <strong>{r.title}</strong>
            <span className={`chip ${STATUS_CHIP[r.status] ?? "chip-gray"}`}>
              {CIRCULAR_STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <div className="muted">
            {r.case_no} ・ 対象: {audienceLabel(r.audience)} ・{" "}
            {VISIBILITY_LABELS[r.visibility] ?? r.visibility}
            {r.deadline && <> ・ 期限: {fmtDate(r.deadline)}</>}
            <br />
            作成: {r.created_by_name}
            {r.status === "published" && <> ・ 確認済み {r.confirmed_count}名</>}
          </div>
          {canDraft(r) && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setOpenDetail(openDetail === r.id ? null : r.id)}
              >
                本文と設定 {openDetail === r.id ? "▲" : "▼"}
              </button>
              {openDetail === r.id && (
                <div className="detail-box">
                  <h3 style={{ marginTop: 0 }}>本文</h3>
                  <p className="pre">{r.body}</p>
                  <hr className="hr-soft" />
                  {/* 公開先・掲載期間はどの状態でも変更できる(オーナー指摘の不統一を解消) */}
                  <ScopeBox r={r} onChanged={load} />
                  <DatesBox r={r} onChanged={load} />
                  {["draft", "pending_approval"].includes(r.status) && (
                    <ImageBox r={r} onChanged={load} />
                  )}
                </div>
              )}
            </>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            {r.status === "draft" && canDraft(r) && (
              <>
                {canApprove(r) ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      act(
                        `/api/admin/circulars/${r.id}/publish`,
                        "公開すると対象者へLINE通知が送られます。よろしいですか?",
                      )
                    }
                  >
                    承認して公開
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => act(`/api/admin/circulars/${r.id}/submit`)}
                  >
                    承認を依頼
                  </button>
                )}
              </>
            )}
            {r.status === "pending_approval" && canApprove(r) && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/circulars/${r.id}/publish`,
                    "公開すると対象者へLINE通知が送られます。よろしいですか?",
                  )
                }
              >
                承認して公開
              </button>
            )}
            {r.status === "published" && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOpenStatus(openStatus === r.id ? null : r.id)}
                >
                  確認状況 {openStatus === r.id ? "▲" : "▼"}
                </button>
                {canApprove(r) && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      act(`/api/admin/circulars/${r.id}/archive`, "この回覧を終了しますか?")
                    }
                  >
                    終了
                  </button>
                )}
              </>
            )}
            {r.status === "archived" && canApprove(r) && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  act(
                    `/api/admin/circulars/${r.id}/publish`,
                    "この回覧を回覧管理に戻して再公開しますか?(対象者へLINE通知が再送されます)",
                  )
                }
              >
                回覧管理に戻す(再公開)
              </button>
            )}
          </div>
          {openStatus === r.id && <StatusView id={r.id} />}
        </div>
      ))}
    </div>
  );
}
