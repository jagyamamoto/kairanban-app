// 会館予約の申請(LINEミニアプリ限定機能)。「前回と同じ」で定例申請を簡略化。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { REPEAT_CHOICES, repeatDates } from "../../../shared/repeat";
import { useMe } from "../../me";
import { fmtDate, todayStr } from "../../util";
import { RESERVATION_STATUS_LABELS } from "../../../shared/labels";
import HallCalendar, { type CalSlot } from "./HallCalendar";
import { Btn } from "../../Btn";
import { useFormErrors } from "../../formfocus";

function buildTimes(earlyAccess: boolean): string[] {
  const times: string[] = [];
  for (let h = earlyAccess ? 6 : 8; h <= 22; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) times.push(`${String(h).padStart(2, "0")}:30`);
  }
  return times;
}

type Slot = CalSlot;
type Mine = {
  org_name: string;
  start_time: string;
  end_time: string;
  purpose: string;
  headcount: number | null;
};

export default function Reserve() {
  const { me } = useMe();
  const earlyAccess = !!me?.user?.hall_early_access;
  const TIMES = buildTimes(earlyAccess);
  const [orgName, setOrgName] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [purpose, setPurpose] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [note, setNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  // 入力もれは「その欄までスクロール＋赤枠」で示す
  const { formRef, err, setErr, fail, clear, fieldProps } = useFormErrors();
  const [busy, setBusy] = useState(false);
  const [doneCaseNo, setDoneCaseNo] = useState("");
  // 繰り返し予約(オーナー指示: 2ヶ月先まで・毎週/隔週などの便利モード)
  const [repeatMode, setRepeatMode] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [repeatDone, setRepeatDone] = useState<{
    created: { case_no: string; date: string }[];
    skipped: { date: string; reason: string }[];
  } | null>(null);
  const [hasLast, setHasLast] = useState<Mine | null>(null);
  const [waitlistMsg, setWaitlistMsg] = useState("");

  useEffect(() => {
    api<{ reservations: Mine[] }>("/api/reservations/mine")
      .then((d) => setHasLast(d.reservations[0] ?? null))
      .catch(() => {});
  }, []);

  const loadSlots = () => {
    if (!date) {
      setSlots(null);
      return;
    }
    api<{ slots: Slot[] }>(`/api/reservations/calendar?from=${date}&to=${date}`)
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
  };
  useEffect(loadSlots, [date]);

  const joinWaitlist = async (slotId: number) => {
    setWaitlistMsg("");
    try {
      await api(`/api/reservations/${slotId}/waitlist`, { body: {} });
      setWaitlistMsg("キャンセル待ちに登録しました。空いたらLINE/通知でお知らせします。");
      loadSlots();
    } catch (e) {
      setWaitlistMsg(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };
  const leaveWaitlist = async (slotId: number) => {
    setWaitlistMsg("");
    try {
      await api(`/api/reservations/${slotId}/waitlist/cancel`, { body: {} });
      setWaitlistMsg("キャンセル待ちを取り消しました。");
      loadSlots();
    } catch (e) {
      setWaitlistMsg(e instanceof Error ? e.message : "取消に失敗しました");
    }
  };

  if (repeatDone) {
    return (
      <div>
        <div className="card center">
          <div className="big-icon">📨</div>
          <h2>{repeatDone.created.length}件の申請を受け付けました</h2>
          <p>会館係が確認し、結果をお知らせします。</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>お申し込みできた日</h3>
          <ul className="plain-list">
            {repeatDone.created.map((r) => (
              <li key={r.case_no}>
                {fmtDate(r.date)} <span className="muted">({r.case_no})</span>
              </li>
            ))}
          </ul>
          {repeatDone.skipped.length > 0 && (
            <>
              <h3>先約があり、お取りできなかった日</h3>
              <ul className="plain-list">
                {repeatDone.skipped.map((r) => (
                  <li key={r.date}>
                    {fmtDate(r.date)} <span className="muted">— {r.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="field-note">
                この日だけ別の時間で使いたい場合は、あらためてお申し込みください。
              </p>
            </>
          )}
        </div>
        <Link className="btn btn-secondary" to="/app/reservations">
          自分の予約を見る
        </Link>
        <Link className="btn btn-secondary" to="/">
          ホームへもどる
        </Link>
      </div>
    );
  }

  if (doneCaseNo) {
    return (
      <div>
        <div className="card center">
          <div className="big-icon">📨</div>
          <h2>申請を受け付けました</h2>
          <p>
            受付番号: <strong>{doneCaseNo}</strong>
          </p>
          <p>会館係が確認し、結果をLINEでお知らせします。</p>
        </div>
        <Link className="btn btn-secondary" to="/app/reservations">
          自分の予約を見る
        </Link>
        <Link className="btn btn-secondary" to="/app">
          ホームへもどる
        </Link>
      </div>
    );
  }

  return (
    <div ref={formRef}>
      <h2>会館の予約を申し込む</h2>
      {hasLast && (
        <button
          className="btn btn-secondary"
          onClick={() => {
            setOrgName(hasLast.org_name);
            setStart(hasLast.start_time);
            setEnd(hasLast.end_time);
            setPurpose(hasLast.purpose);
            setHeadcount(hasLast.headcount ? String(hasLast.headcount) : "");
          }}
        >
          前回と同じ内容を入れる
        </button>
      )}
      <h3 style={{ marginTop: 0 }}>空き状況カレンダー</h3>
      <p className="field-note" style={{ marginTop: 0 }}>
        日にちを押すと、その日の予約状況が見られます。
      </p>
      <HallCalendar selectedDate={date} onPickDate={setDate} />

      <div className="card">
        <label htmlFor="rsv-org">利用する団体・会の名前</label>
        <input
          id="rsv-org" {...fieldProps("org")}
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="例: 子ども会"
        />

        <label htmlFor="rsv-date">利用日</label>
        <input id="rsv-date" {...fieldProps("date")} type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />

        {waitlistMsg && <p className="ok-note">{waitlistMsg}</p>}
        {slots !== null && (
          <div className="field-note">
            {slots.length === 0 ? (
              <span className="ok-note">この日の予約はまだありません。</span>
            ) : (
              <>
                この日の予約状況:
                {slots.map((s) => (
                  <div key={s.id} style={{ marginBottom: 4 }}>
                    {s.start_time}〜{s.end_time} {s.org_name}(
                    {RESERVATION_STATUS_LABELS[s.status]}
                    {s.provisional && "・仮予約"})
                    {s.provisional && !s.is_mine && !s.has_waitlist && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ margin: "2px 0 0 6px", padding: "2px 8px" }}
                        onClick={() => joinWaitlist(s.id)}
                      >
                        キャンセル待ちに登録
                      </button>
                    )}
                    {s.waitlist_is_mine && (
                      <>
                        <span className="chip chip-orange" style={{ marginLeft: 6 }}>
                          キャンセル待ち登録中
                        </span>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ margin: "2px 0 0 6px", padding: "2px 8px" }}
                          onClick={() => leaveWaitlist(s.id)}
                        >
                          取消
                        </button>
                      </>
                    )}
                    {s.has_waitlist && !s.waitlist_is_mine && (
                      <span className="chip chip-gray" style={{ marginLeft: 6 }}>
                        キャンセル待ちあり(先着1名)
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="rsv-start">開始</label>
            <select id="rsv-start" value={start} onChange={(e) => setStart(e.target.value)}>
              {TIMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="rsv-end">終了</label>
            <select id="rsv-end" {...fieldProps("end")} value={end} onChange={(e) => setEnd(e.target.value)}>
              {TIMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="field-note">
          {earlyAccess
            ? "特別に朝6時〜夜22時でご利用いただけます。"
            : "会館は朝8時〜夜22時でご利用いただけます。"}
        </p>

        <label htmlFor="rsv-purpose">利用目的</label>
        <input
          id="rsv-purpose" {...fieldProps("purpose")}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="例: 定例会"
        />

        <label htmlFor="rsv-cname">当日の担当者のお名前(必須)</label>
        <input
          id="rsv-cname" {...fieldProps("cname")} autoComplete="name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="例: 山田 太郎"
        />

        <label htmlFor="rsv-cphone">担当者の電話番号(必須・ハイフンなし)</label>
        <input
          id="rsv-cphone" {...fieldProps("cphone")} autoComplete="tel"
          type="tel"
          inputMode="numeric"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="例: 09012345678"
        />
        <p className="field-note">当日の連絡がとれる番号をご記入ください。</p>

        <label htmlFor="rsv-headcount">おおよその人数(任意)</label>
        <input
          id="rsv-headcount"
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(e.target.value)}
        />

        <label htmlFor="rsv-note">備考(任意)</label>
        <textarea id="rsv-note" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="recommend-box" style={{ background: "#f7f9fb", borderColor: "#c8d6e0" }}>
          {/* ここは入力欄の名前ではなく、下のラジオ全体の見出し。
              <label> にすると「押しても何も起きないラベル」になるので見出しにする */}
          <h3 style={{ marginTop: 0 }}>くりかえし予約(定例でお使いの場合)</h3>
          <p className="field-note" style={{ marginTop: 0 }}>
            同じ曜日・同じ時間の予定をまとめてお申し込みできます(2ヶ月先まで)。
          </p>
          {REPEAT_CHOICES.map((r) => (
            <label className="checkbox-row" key={r.key}>
              <input
                type="radio"
                name="repeat"
                checked={repeatMode === r.key}
                onChange={() => setRepeatMode(r.key)}
              />
              <span style={{ whiteSpace: "nowrap" }}>{r.label}</span>
              {r.note && <span className="muted">— {r.note}</span>}
            </label>
          ))}
          {repeatMode !== "none" && date && (
            <p className="field-note">
              予定日: {repeatDates(date, repeatMode).map(fmtDate).join("、")}
              <br />
              先に予約が入っている日は自動で飛ばし、残りをお取りします。
            </p>
          )}
        </div>

        {err && (
          <p className="error-box" role="alert">
            {err}
          </p>
        )}
        <Btn
          className="btn btn-primary"
          busy={busy}
          onClick={async () => {
            // 送る前にこちらで確かめ、直すべき欄まで案内する
            if (!orgName.trim()) return fail("org", "利用する団体・会の名前を入れてください。");
            if (!date) return fail("date", "利用日を選んでください。");
            if (end <= start) return fail("end", "終了時刻は開始時刻より後にしてください。");
            if (!purpose.trim()) return fail("purpose", "利用目的を入れてください。");
            if (!contactName.trim()) return fail("cname", "当日の担当者のお名前を入れてください。");
            if (contactPhone.replace(/[^0-9]/g, "").length < 10)
              return fail("cphone", "担当者の電話番号を、市外局番から入れてください。");
            clear();
            setBusy(true);
            try {
              const body = {
                org_name: orgName,
                date,
                start_time: start,
                end_time: end,
                purpose,
                headcount: headcount ? Number(headcount) : undefined,
                note,
                contact_name: contactName,
                contact_phone: contactPhone,
              };
              if (repeatMode === "none") {
                const d = await api<{ reservation: { case_no: string } }>("/api/reservations", {
                  body,
                });
                setDoneCaseNo(d.reservation.case_no);
              } else {
                const d = await api<{
                  created: { case_no: string; date: string }[];
                  skipped: { date: string; reason: string }[];
                }>("/api/reservations/repeat", { body: { ...body, mode: repeatMode } });
                setRepeatDone({ created: d.created, skipped: d.skipped });
              }
            } catch (e) {
              setErr(e instanceof Error ? e.message : "申請に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          {repeatMode === "none" ? "この内容で申し込む" : "この内容でまとめて申し込む"}
        </Btn>
        <p className="muted">申し込み後、会館係が確認して結果をお知らせします。</p>
      </div>
    </div>
  );
}
