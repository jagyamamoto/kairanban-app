// 広告枠管理: 作成・編集・状態変更(下書き/掲載中/終了)
// 将来LINE有料プランへ移行する際の運用資金づくりが目的。
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDate } from "../../util";
import { SPONSOR_STATUS_LABELS } from "../../../shared/labels";
import { Btn } from "../../Btn";

type Sponsor = {
  id: number;
  name: string;
  message: string;
  url: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by_name: string;
};

const STATUS_CHIP: Record<string, string> = {
  draft: "chip-gray",
  active: "chip-green",
  archived: "chip-gray",
};

type FormState = {
  name: string;
  message: string;
  url: string;
  image_url: string;
  start_date: string;
  end_date: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  message: "",
  url: "",
  image_url: "",
  start_date: "",
  end_date: "",
};

function SponsorFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <>
      <label htmlFor="spo-name">広告主名</label>
      <input
        id="spo-name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="例: ○○商店"
      />
      <label htmlFor="spo-message">広告文</label>
      <textarea
        id="spo-message"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        placeholder="短い紹介文"
      />
      <label htmlFor="spo-url">リンク先URL(任意)</label>
      <input
        id="spo-url"
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value })}
        placeholder="https://..."
      />
      <label htmlFor="spo-image_url">画像URL(任意・広告主側で用意した画像へのリンク)</label>
      <input
        id="spo-image_url"
        value={form.image_url}
        onChange={(e) => setForm({ ...form, image_url: e.target.value })}
        placeholder="https://..."
      />
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="spo-start_date">掲載開始日(任意)</label>
          <input
            id="spo-start_date"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="spo-end_date">掲載終了日(任意)</label>
          <input
            id="spo-end_date"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <SponsorFields form={form} setForm={setForm} />
      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          if (!form.name.trim() || !form.message.trim()) {
            setErr("広告主名と広告文を入力してください");
            return;
          }
          setBusy(true);
          try {
            await api("/api/admin/sponsors", {
              body: {
                name: form.name,
                message: form.message,
                url: form.url || undefined,
                image_url: form.image_url || undefined,
                start_date: form.start_date || undefined,
                end_date: form.end_date || undefined,
              },
            });
            setForm(EMPTY_FORM);
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

function EditForm({
  s,
  onDone,
  onCancel,
}: {
  s: Sponsor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: s.name,
    message: s.message,
    url: s.url ?? "",
    image_url: s.image_url ?? "",
    start_date: s.start_date ?? "",
    end_date: s.end_date ?? "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <SponsorFields form={form} setForm={setForm} />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <Btn
          className="btn btn-primary btn-sm"
          busy={busy}
          busyLabel="保存中…"
          onClick={async () => {
            if (!form.name.trim() || !form.message.trim()) {
              setErr("広告主名と広告文を入力してください");
              return;
            }
            setBusy(true);
            try {
              await api(`/api/admin/sponsors/${s.id}`, {
                method: "PUT",
                body: {
                  name: form.name,
                  message: form.message,
                  url: form.url || null,
                  image_url: form.image_url || null,
                  start_date: form.start_date || null,
                  end_date: form.end_date || null,
                },
              });
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

export default function SponsorsAdmin() {
  const [rows, setRows] = useState<Sponsor[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ sponsors: Sponsor[] }>("/api/admin/sponsors")
      .then((d) => setRows(d.sponsors))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/admin/sponsors/${id}/status`, { body: { status } });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      <div className="card">
        <p className="muted">
          将来LINEの有料プランへ移行する際の運用資金として、地域の業者向けに広告枠を提供できます。
          「掲載中にする」を押すと公開ページと会員アプリのホームに表示されます。
        </p>
      </div>
      {err && <p className="error">{err}</p>}
      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 新しい広告を作る</summary>
        <CreateForm onDone={load} />
      </details>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows?.map((s) => (
        <div className="card" key={s.id}>
          <div className="spread">
            <strong>{s.name}</strong>
            <span className={`chip ${STATUS_CHIP[s.status] ?? "chip-gray"}`}>
              {SPONSOR_STATUS_LABELS[s.status] ?? s.status}
            </span>
          </div>
          {editingId === s.id ? (
            <EditForm
              s={s}
              onDone={() => {
                setEditingId(null);
                load();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <p className="muted" style={{ marginTop: 4 }}>
                {s.message}
              </p>
              <div className="muted">
                {s.url && (
                  <>
                    リンク: {s.url}
                    <br />
                  </>
                )}
                {(s.start_date || s.end_date) && (
                  <>
                    掲載期間: {s.start_date ? fmtDate(s.start_date) : "制限なし"} 〜{" "}
                    {s.end_date ? fmtDate(s.end_date) : "制限なし"}
                    <br />
                  </>
                )}
                作成: {s.created_by_name}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {s.status !== "active" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setStatus(s.id, "active")}
                  >
                    掲載中にする
                  </button>
                )}
                {s.status === "active" && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setStatus(s.id, "draft")}
                  >
                    非公開にする
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(s.id)}>
                  編集
                </button>
                {s.status !== "archived" && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm("この広告を終了しますか?")) setStatus(s.id, "archived");
                    }}
                  >
                    終了にする
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
