// 会館係: 予約の担当引受(排他)・承認・差戻し・代理申請
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useMe } from "../../me";
import { fmtDate, todayStr } from "../../util";
import { RESERVATION_STATUS_LABELS } from "../../../shared/labels";

type Row = {
  id: number;
  case_no: string;
  org_name: string;
  applicant_name: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  headcount: number | null;
  note: string | null;
  status: string;
  status_reason: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  proxy_by: number | null;
  waitlist_person_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

const CHIP: Record<string, string> = {
  received: "chip-red",
  checking: "chip-orange",
  approved: "chip-green",
  rejected: "chip-gray",
  cancelled: "chip-gray",
  done: "chip-gray",
};

function ProxyForm({ onDone }: { onDone: () => void }) {
  const [persons, setPersons] = useState<{ id: number; name: string }[]>([]);
  const [applicantId, setApplicantId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [purpose, setPurpose] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ persons: { id: number; name: string }[] }>("/api/admin/persons/options")
      .then((d) => setPersons(d.persons))
      .catch(() => {});
  }, []);

  return (
    <div>
      <p className="muted">紙・電話で受けた申請を代わりに入力します(入力者が記録されます)。</p>
      <label htmlFor="arsv-applicant-id">申請者</label>
      <select id="arsv-applicant-id" value={applicantId} onChange={(e) => setApplicantId(e.target.value)}>
        <option value="">選んでください</option>
        {persons.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="arsv-org-name">利用団体名</label>
      <input id="arsv-org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
      <label htmlFor="arsv-date">利用日</label>
      <input id="arsv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="arsv-start">開始</label>
          <input id="arsv-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="arsv-end">終了</label>
          <input id="arsv-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <label htmlFor="arsv-purpose">利用目的</label>
      <input id="arsv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      <label htmlFor="arsv-contact-name">当日の担当者のお名前(必須)</label>
      <input id="arsv-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      <label htmlFor="arsv-contact-phone">担当者の電話番号(必須・ハイフンなし)</label>
      <input id="arsv-contact-phone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-primary"
        onClick={async () => {
          try {
            await api("/api/admin/reservations/proxy", {
              body: {
                applicant_id: applicantId ? Number(applicantId) : undefined,
                org_name: orgName,
                date,
                start_time: start,
                end_time: end,
                purpose,
                contact_name: contactName,
                contact_phone: contactPhone,
              },
            });
            setOrgName("");
            setDate("");
            setPurpose("");
            setContactName("");
            setContactPhone("");
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "登録に失敗しました");
          }
        }}
      >
        代理で申請を登録
      </button>
    </div>
  );
}

export default function ReservationsAdmin() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("active");
  const [err, setErr] = useState("");
  const myId = me?.user?.id;

  const load = () =>
    api<{ reservations: Row[] }>("/api/admin/reservations")
      .then((d) => setRows(d.reservations))
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  useEffect(() => {
    load();
  }, []);

  const filtered =
    rows?.filter((r) => {
      if (filter === "active") return ["received", "checking"].includes(r.status);
      if (filter === "upcoming") return r.status === "approved" && r.date >= todayStr();
      return true;
    }) ?? [];

  const setStatus = async (r: Row, status: string) => {
    let reason: string | undefined;
    if (status === "rejected") {
      reason = window.prompt("差戻しの理由(申請者に伝わります)") ?? undefined;
      if (reason === undefined) return;
    } else if (!window.confirm(`${RESERVATION_STATUS_LABELS[status]}にしますか?`)) {
      return;
    }
    try {
      await api(`/api/admin/reservations/${r.id}/status`, { body: { status, reason } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="tabbar">
        {[
          ["active", "対応が必要"],
          ["upcoming", "今後の利用"],
          ["all", "すべて"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`tab${filter === k ? " active" : ""}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {rows === null && <p className="muted">読み込み中…</p>}
      {rows !== null && filtered.length === 0 && (
        <div className="card">
          <p className="muted">該当する予約はありません。</p>
        </div>
      )}
      {filtered.map((r) => (
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
            {r.case_no} ・ {r.org_name} ・ 申請: {r.applicant_name}
            {r.proxy_by && "(代理入力)"}
            <br />
            目的: {r.purpose}
            {r.headcount && ` ・ ${r.headcount}名`}
            {r.contact_name && (
              <>
                <br />
                当日担当: {r.contact_name}
                {r.contact_phone && (
                  <>
                    {" "}
                    <a href={`tel:${r.contact_phone}`}>{r.contact_phone}</a>
                  </>
                )}
              </>
            )}
            {r.note && (
              <>
                <br />
                備考: {r.note}
              </>
            )}
            {r.waitlist_person_name && (
              <>
                <br />
                <span className="chip chip-orange">キャンセル待ち: {r.waitlist_person_name}さん</span>
              </>
            )}
          </div>
          <div style={{ marginTop: 6 }}>
            {r.assignee_name ? (
              <span className="chip chip-green">担当: {r.assignee_name}</span>
            ) : (
              ["received", "checking"].includes(r.status) && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    try {
                      await api(`/api/admin/reservations/${r.id}/claim`, { body: {} });
                      await load();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "操作に失敗しました");
                      await load();
                    }
                  }}
                >
                  担当します
                </button>
              )
            )}
          </div>
          {["received", "checking"].includes(r.status) && r.assignee_id === myId && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(r, "approved")}>
                承認
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setStatus(r, "rejected")}>
                差戻し
              </button>
            </div>
          )}
          {r.status === "approved" && (
            <button className="btn btn-secondary btn-sm" onClick={() => setStatus(r, "done")}>
              利用済みにする
            </button>
          )}
        </div>
      ))}

      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>
          紙・電話の申請を代理入力する
        </summary>
        <ProxyForm onDone={load} />
      </details>
    </div>
  );
}
