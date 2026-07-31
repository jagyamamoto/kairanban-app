// 会員管理: 承認、役割・任期、紙利用者の代理登録、退会
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDate } from "../../util";
import {
  ASSIGNABLE_ROLES,
  MEMBER_STATUS_LABELS,
  ROLE_LABELS,
} from "../../../shared/labels";

import { MISSING_LABELS, missingFields } from "../../../shared/profile";
import { Btn } from "../../Btn";

type Member = {
  id: number;
  name: string;
  kana: string | null;
  contact: string | null;
  phone: string | null;
  lang: string;
  is_digital: number;
  status: string;
  note: string | null;
  created_at: string;
  has_line: boolean;
  roles: string[];
  hall_early_access: number;
  address: string | null;
  household_head: string | null;
  email: string | null;
  requested_roles: string | null;
  signup_note: string | null;
  approved_at: string | null;
  duplicate_of: number[];
};

// 会館の早朝利用(6時から)を許可するかどうか(オーナー指示: タクシー会社など一部会員だけの特別扱い)
function EarlyAccessRow({ m, onChanged }: { m: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        checked={!!m.hall_early_access}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          try {
            await api(`/api/admin/members/${m.id}`, {
              method: "PUT",
              body: { hall_early_access: e.target.checked },
            });
            onChanged();
          } finally {
            setBusy(false);
          }
        }}
      />
      会館を朝6時から利用できる(タクシー会社など特別扱いの会員)
    </label>
  );
}

// 電話番号(PWAログイン用)の表示・登録・変更
function PhoneRow({ m, onChanged }: { m: Member; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(m.phone ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <div className="row" style={{ marginTop: 8 }}>
        <span>
          電話番号(ログイン用):{" "}
          {m.phone ? (
            <strong style={{ fontFamily: "monospace", fontSize: 18 }}>{m.phone}</strong>
          ) : (
            <span className="muted">未登録</span>
          )}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setValue(m.phone ?? "");
            setErr("");
            setEditing(true);
          }}
        >
          {m.phone ? "変更" : "登録"}
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <label htmlFor="mem-value">電話番号(ハイフンなし・携帯/固定どちらでも可)</label>
      <input
        id="mem-value"
        type="tel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例: 09012345678"
      />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <Btn
          className="btn btn-primary btn-sm"
          busy={busy}
          busyLabel="保存中…"
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await api(`/api/admin/members/${m.id}`, {
                method: "PUT",
                body: { phone: value },
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

type Assignment = {
  id: number;
  role: string;
  scope: string | null;
  start_date: string;
  end_date: string | null;
  granted_by_name: string | null;
};

// 未記入の項目(判定は shared/profile.ts に1本化)
function missingOf(m: Member) {
  return missingFields({
    name: m.name,
    address: m.address,
    household_head: m.household_head,
    email: m.email,
    phone: m.phone,
    roles: m.roles,
  });
}

function ApproveBox({ m, onDone }: { m: Member; onDone: () => void }) {
  // 本人の自己申告を初期値にする。間違っている可能性があるので役員が直せる(オーナー指示)。
  const [roles, setRoles] = useState<string[]>(() => {
    try {
      const r = m.requested_roles ? (JSON.parse(m.requested_roles) as string[]) : [];
      return r.length ? r : ["member"];
    } catch {
      return ["member"];
    }
  });
  const [err, setErr] = useState("");
  const toggle = (r: string) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  let requested: string[] = [];
  try {
    requested = m.requested_roles ? (JSON.parse(m.requested_roles) as string[]) : [];
  } catch {
    requested = [];
  }
  return (
    <div>
      {m.address && (
        <p className="muted" style={{ margin: "4px 0" }}>
          住所: みどり町三丁目 {m.address}
          {m.phone && <> ・ 電話: {m.phone}</>}
        </p>
      )}
      {/* 町内会は世帯単位。名義が本人と違う場合は分かるように出す(オーナー指示) */}
      {m.household_head && m.household_head !== m.name && (
        <p className="muted" style={{ margin: "4px 0" }}>
          世帯主(代表者): <strong>{m.household_head}</strong>(ご本人と異なります)
        </p>
      )}
      {m.signup_note && <p className="muted" style={{ margin: "4px 0" }}>連絡事項: {m.signup_note}</p>}
      {requested.length > 0 && (
        <p className="field-note" style={{ margin: "4px 0" }}>
          本人の申告: {requested.map((r) => ROLE_LABELS[r] ?? r).join("・")}
          (下で直せます)
        </p>
      )}
      <div className="row" style={{ margin: "8px 0" }}>
        {ASSIGNABLE_ROLES.filter((r) => r !== "admin").map((r) => (
          <label
            key={r}
            style={{ fontWeight: 400, margin: 0, display: "flex", alignItems: "center", gap: 4 }}
          >
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={roles.includes(r)}
              onChange={() => toggle(r)}
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-primary btn-sm"
        onClick={async () => {
          try {
            await api(`/api/admin/members/${m.id}/approve`, { body: { roles } });
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "保存に失敗しました");
          }
        }}
      >
        この内容で確定
      </button>
      <button
        className="btn btn-danger btn-sm"
        onClick={async () => {
          if (!window.confirm(`${m.name} さんの登録を取り消しますか?(ログインできなくなります)`)) return;
          try {
            await api(`/api/admin/members/${m.id}/reject`, { body: {} });
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "操作に失敗しました");
          }
        }}
      >
        登録を取り消す
      </button>
    </div>
  );
}

function MemberDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [role, setRole] = useState("officer");
  const [endDate, setEndDate] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    api<{ assignments: Assignment[] }>(`/api/admin/members/${id}`)
      .then((d) => setAssignments(d.assignments))
      .catch(() => setAssignments([]));
  useEffect(() => {
    load();
  }, [id]);

  const active = (a: Assignment) => !a.end_date || a.end_date >= new Date().toISOString().slice(0, 10);

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
      <h3 style={{ marginTop: 0 }}>役割と任期</h3>
      {assignments === null && <p className="muted">読み込み中…</p>}
      {assignments?.map((a) => (
        <div className="row" key={a.id} style={{ marginBottom: 6 }}>
          <span className={`chip ${active(a) ? "chip-green" : "chip-gray"}`}>
            {ROLE_LABELS[a.role] ?? a.role}
          </span>
          <span className="muted">
            {fmtDate(a.start_date)}〜{a.end_date ? fmtDate(a.end_date) : ""}
          </span>
          {active(a) && (
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm(`${ROLE_LABELS[a.role] ?? a.role} を終了しますか?`)) return;
                await api(`/api/admin/members/roles/${a.id}/end`, { body: {} });
                await load();
                onChanged();
              }}
            >
              終了
            </button>
          )}
        </div>
      ))}
      <div className="row">
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ flex: 2 }}>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ flex: 2 }}
          title="任期末(空欄=無期限)"
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            try {
              await api(`/api/admin/members/${id}/roles`, {
                body: { role, end_date: endDate || undefined },
              });
              await load();
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "付与に失敗しました");
            }
          }}
        >
          役割を追加
        </button>
      </div>
      <p className="field-note">日付は任期末(空欄なら無期限)。任期が過ぎると自動で失効します。</p>
      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-danger btn-sm"
        onClick={async () => {
          if (!window.confirm("退会にすると、すべての権限が即時停止します。よろしいですか?"))
            return;
          await api(`/api/admin/members/${id}/leave`, { body: {} });
          onChanged();
        }}
      >
        退会にする
      </button>
    </div>
  );
}

// 会員登録(役員が窓口・紙の申込書などから代理で登録する画面)。
// アプリを使う方は電話番号が必須(ログインに使うため)。役割もこの場で付けられる。
function RegisterForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [paper, setPaper] = useState(false); // 既定はアプリを使う方
  const [roles, setRoles] = useState<string[]>(["member"]);
  const [early, setEarly] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleRole = (r: string) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const reset = () => {
    setName("");
    setKana("");
    setContact("");
    setPhone("");
    setNote("");
    setRoles(["member"]);
    setEarly(false);
    setPaper(false);
  };

  return (
    <details className="card">
      <summary style={{ fontWeight: 700, cursor: "pointer" }}>+ 会員を登録する</summary>
      <p className="field-note">
        窓口や紙の申込書で受け付けた方を、役員が代わりに登録します。登録した時点で「有効」になります。
      </p>

      <label htmlFor="mem-name">お名前(必須)</label>
      <input id="mem-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 太郎" />

      <label htmlFor="mem-kana">ふりがな(任意)</label>
      <input id="mem-kana" value={kana} onChange={(e) => setKana(e.target.value)} placeholder="例: やまだ たろう" />

      <label className="checkbox-row">
        <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} />
        紙・電話で対応する方(スマホを使わない)
      </label>

      {paper ? (
        <>
          <label htmlFor="mem-contact">連絡方法(任意・電話番号やご住所など)</label>
          <input
            id="mem-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="例: 自宅 03-1234-5678"
          />
          <p className="field-note">
            紙・電話の方はアプリにログインしません。回覧の確認は役員が代理で記録します。
          </p>
        </>
      ) : (
        <>
          <label htmlFor="mem-phone">電話番号(必須・ログインに使います・ハイフンなし)</label>
          <input
            id="mem-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="例: 09012345678"
          />
          <p className="field-note">
            この番号がそのままログインに使われます。ご本人に「この番号でログインできます」とお伝えください。
          </p>
        </>
      )}

      <p className="group-label">役割(複数選択可)</p>
      <div className="row" style={{ margin: "4px 0" }}>
        {ASSIGNABLE_ROLES.filter((r) => r !== "admin").map((r) => (
          <label
            key={r}
            style={{ fontWeight: 400, margin: 0, display: "flex", alignItems: "center", gap: 4 }}
          >
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={roles.includes(r)}
              onChange={() => toggleRole(r)}
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
        会館を朝6時から利用できる(タクシー会社など特別扱いの会員)
      </label>

      <label htmlFor="mem-note">メモ(任意・役員だけが見られます)</label>
      <input id="mem-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 3班・班長経験あり" />

      {err && <p className="error">{err}</p>}
      {msg && <p className="ok-note">{msg}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          setErr("");
          setMsg("");
          if (!name.trim()) {
            setErr("お名前を入力してください");
            return;
          }
          if (!paper && !phone.trim()) {
            setErr("アプリを使う方は電話番号を入力してください");
            return;
          }
          setBusy(true);
          try {
            await api("/api/admin/members", {
              body: {
                name: name.trim(),
                kana: kana.trim() || undefined,
                contact: contact.trim() || undefined,
                phone: phone.trim() || undefined,
                is_digital: !paper,
                note: note.trim() || undefined,
                roles,
                hall_early_access: early,
              },
            });
            setMsg(`${name.trim()} さんを登録しました。`);
            reset();
            await onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "登録に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        この内容で登録する
      </Btn>
    </details>
  );
}

export default function Members() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ members: Member[] }>("/api/admin/members")
      .then((d) => setMembers(d.members))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
        setMembers([]);
      });
  useEffect(() => {
    load();
  }, []);

  // 会員登録は自動承認になったため(オーナー方針)、「承認待ち」ではなく
  // 「役員がまだ目を通していない会員」を先頭に出す。approved_at が入ると消える。
  const unreviewed = members?.filter((m) => m.status === "pending" || !m.approved_at) ?? [];
  const incompleteCount = (members ?? []).filter(
    (m) => m.status === "active" && missingOf(m).length > 0,
  ).length;
  const active = members?.filter((m) => m.status === "active") ?? [];
  const left = members?.filter((m) => m.status === "left") ?? [];

  return (
    <div>
      {err && <p className="error">{err}</p>}
      {unreviewed.length > 0 && (
        <div>
          <h2>
            確認が必要な会員 <span className="chip chip-red">{unreviewed.length}件</span>
          </h2>
          <p className="field-note">
            ご本人の登録はすでに有効です。内容を確認し、所属(会員レベル)が正しければ
            「この内容で確定」を押してください。町内会の方でなければ「登録を取り消す」を選びます。
          </p>
          {unreviewed.map((m) => (
            <div className="card" key={m.id}>
              <div className="spread">
                <strong>{m.name}</strong>
                <span className="chip chip-gray">
                  {m.address ? "本人申請" : m.has_line ? "LINE" : "手入力"}
                </span>
              </div>
              {m.duplicate_of.length > 0 && (
                <p className="error" style={{ margin: "4px 0" }}>
                  ⚠ 重複の可能性があります(
                  {m.duplicate_of
                    .map((id) => members?.find((x) => x.id === id)?.name)
                    .filter(Boolean)
                    .join("、")}
                  )。同じ方なら「登録を取り消す」を選んでください。
                </p>
              )}
              <ApproveBox m={m} onDone={load} />
            </div>
          ))}
        </div>
      )}

      <h2>会員({active.length}名)</h2>
      {/* 役員の代理入力では「名」「メール」が抜けがち。赤で分かるようにする(オーナー指示) */}
      {incompleteCount > 0 && (
        <p className="error">
          ⚠ {incompleteCount}名の登録内容に未記入があります(赤い枠)。
          <br />
          <span style={{ fontWeight: 400 }}>
            ご本人はアプリのホーム「あなたの登録内容」から直せます。月に1度、本人へお知らせが届きます。
          </span>
        </p>
      )}
      {members === null && <p className="muted">読み込み中…</p>}
      {active.map((m) => (
        <div className={`card${missingOf(m).length ? " card-warn" : ""}`} key={m.id}>
          <div
            className="spread"
            style={{ cursor: "pointer" }}
            onClick={() => setOpen(open === m.id ? null : m.id)}
          >
            <strong>
              {m.name}
              {m.kana && <span className="muted">({m.kana})</span>}
            </strong>
            <span className="row">
              {missingOf(m).length > 0 && <span className="chip chip-red">未記入</span>}
              {m.duplicate_of.length > 0 && <span className="chip chip-red">重複?</span>}
              {!m.is_digital && <span className="chip chip-orange">紙・電話</span>}
              {m.roles
                .filter((r) => r !== "member")
                .map((r) => (
                  <span className="chip chip-green" key={r}>
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              <span className="muted">{open === m.id ? "▲" : "▼"}</span>
            </span>
          </div>
          {missingOf(m).length > 0 && (
            <p className="error" style={{ margin: "4px 0", fontSize: 15 }}>
              未記入: {missingOf(m).map((x) => MISSING_LABELS[x]).join("・")}
            </p>
          )}
          {open === m.id && (
            <>
              <PhoneRow m={m} onChanged={load} />
              <EarlyAccessRow m={m} onChanged={load} />
              <MemberDetail id={m.id} onChanged={load} />
            </>
          )}
        </div>
      ))}

      <RegisterForm onDone={load} />

      {left.length > 0 && (
        <details className="card">
          <summary className="muted" style={{ cursor: "pointer" }}>
            退会者({left.length}名)
          </summary>
          {left.map((m) => (
            <div className="list-item muted" key={m.id}>
              {m.name}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
