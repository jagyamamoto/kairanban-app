// ホーム: 自分に必要な未確認・期限・予約を最初に表示
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useMe } from "../../me";
import { LineLoginButton } from "../../lineconsent";
import { getPushState, subscribePush, type PushState } from "../../push";
import { onInstallAvailable, promptInstall } from "../../install";
import { renderGoogleButton } from "../../google";
import { fmtDate } from "../../util";
import { RESERVATION_STATUS_LABELS, ROLE_LABELS } from "../../../shared/labels";
import { MISSING_LABELS, missingFields } from "../../../shared/profile";
import { isHallUserOnly } from "../../../shared/roles";
import { Btn } from "../../Btn";
import { useFormErrors } from "../../formfocus";

// 通知の設定カード(Web Push)。ボタンを探して押す手間をなくすため、ホーム画面表示時に
// 自動で許可を求める(オーナー指示: 高齢の会員が多く、細かい設定操作をさせない)。
// ブラウザの許可ダイアログ自体は必ず1回出るが、アプリ内の操作は不要にする。
export function NotificationCard() {
  const { me } = useMe();
  const vapid = me?.config.vapidPublicKey;
  const [state, setState] = useState<PushState | "loading">("loading");
  const [err, setErr] = useState("");
  const [autoTried, setAutoTried] = useState(false);
  // Android/Chrome は「ホーム画面に追加」をボタン1つで出せる
  const [canInstallNow, setCanInstallNow] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => onInstallAvailable(setCanInstallNow), []);

  useEffect(() => {
    if (!vapid) return;
    getPushState().then(setState);
  }, [vapid]);

  useEffect(() => {
    if (!vapid || state !== "off" || autoTried) return;
    setAutoTried(true);
    subscribePush(vapid)
      .then(() => setState("subscribed"))
      .catch((e) => {
        // ダイアログを閉じた・拒否した場合は静かに諦める(次回訪問時に再度自動で促す)
        setErr(e instanceof Error ? e.message : "");
      });
  }, [vapid, state, autoTried]);

  // 通知が既に有効でも、まだアプリとして入れていない端末には追加ボタンだけ出す。
  // ⚠ 準備済み(subscribed)のときも、このカードは出す。
  //   「通知が来ない」は困りごとの上位なので、自分で確かめる手段をここに置いている
  //   (画面の下のほう=毎日見るものではない位置に置いてあるので邪魔にならない)。
  if (!vapid || state === "loading" || state === "unsupported") return null;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🔔 お知らせ通知</h2>
      {canInstallNow && (
        <>
          <p>
            このアプリを<strong>ホーム画面に追加</strong>すると、お知らせが届くようになります。
          </p>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const ok = await promptInstall();
              setInstallMsg(
                ok
                  ? "ホーム画面に追加しました。次からはアイコンから開いてください。"
                  : "追加しませんでした。あとからでも追加できます。",
              );
            }}
          >
            ホーム画面に追加する
          </button>
          {installMsg && <p className="ok-note">{installMsg}</p>}
        </>
      )}
      {state === "need_install" && !canInstallNow && (
        // ⚠ ここに手順を書かないこと。手順は InstallGuide.tsx だけに置いてある。
        //   以前はここにも「画面下の共有ボタン →」と書いてあり、
        //   アプリ内の案内(「画面の右下の …マークを押す」)と食い違っていた。
        <p>
          通知を受け取るには、このアプリを<strong>ホーム画面に追加</strong>
          してから開いてください。
          <br />
          <span className="muted">
            右上の「☰」から<strong>「最初の設定」</strong>を押すと、押すものを1つずつ案内します。
          </span>
        </p>
      )}
      {state === "denied" && (
        <p className="muted">
          通知がブロックされています。端末の設定でこのサイトの通知を許可してください。
        </p>
      )}
      {/* 通知が自分に届くかを自分で確かめられるようにする(オーナー指示 2026-07-30)。
          ⚠ 送れるのは自分宛だけ(サーバ側で自分に固定している)。 */}
      {state === "subscribed" && (
        <>
          <p className="ok-note" style={{ marginTop: 0 }}>
            ✅ 通知を受け取る準備ができています
          </p>
          <Btn
            className="btn btn-secondary"
            busy={testing}
            busyLabel="送っています…"
            onClick={async () => {
              setTesting(true);
              setTestMsg("");
              try {
                const r = await api<{ ok: boolean; message: string }>("/api/me/test-push", {
                  body: {},
                });
                setTestMsg(r.message);
              } catch (e) {
                setTestMsg(e instanceof Error ? e.message : "送れませんでした");
              } finally {
                setTesting(false);
              }
            }}
          >
            自分宛にテスト通知を送ってみる
          </Btn>
          {testMsg && <p className="field-note">{testMsg}</p>}
        </>
      )}
      {state === "off" && (
        <>
          <p>新しい回覧が届いたときに、この端末へ通知します(無料)。</p>
          <p className="muted">画面に出た確認で「許可」を押してください。</p>
          {err && <p className="error">{err}</p>}
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await subscribePush(vapid);
                setState("subscribed");
              } catch (e) {
                setErr(e instanceof Error ? e.message : "設定に失敗しました");
              }
            }}
          >
            通知を受け取る
          </button>
        </>
      )}
    </div>
  );
}


// 自分の登録内容を自分で直すカード(オーナー指示 2026-07-30)。
// 役員が代わりに入力すると「名が抜けている」「メールが無い」ことが起きるため、
// 不足があるときは**赤く**出して本人に直してもらう。月に1度は通知も飛ぶ。
export function MyProfileCard() {
  const { me, refresh } = useMe();
  const u = me?.user;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [address, setAddress] = useState("");
  const [headSame, setHeadSame] = useState(false);
  const [householdHead, setHouseholdHead] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 入力もれは「その欄までスクロール＋赤枠」で示す
  const { formRef, err, setErr, fail, clear, fieldProps } = useFormErrors();

  // 開いたときに今の値を入れる
  useEffect(() => {
    if (!open || !u) return;
    setName(u.name ?? "");
    setKana(u.kana ?? "");
    setAddress(u.address ?? "");
    setEmail(u.email ?? "");
    setPhone(u.phone ?? "");
    setHouseholdHead(u.household_head ?? "");
    setHeadSame(!!u.household_head && u.household_head === u.name);
    setErr("");
    setMsg("");
  }, [open, u]);

  if (!u) return null;
  const hallOnly = isHallUserOnly(u.roles);
  const missing = missingFields({
    name: u.name,
    address: u.address,
    household_head: u.household_head,
    email: u.email,
    phone: u.phone,
    roles: u.roles,
  });

  return (
    <div className={`card${missing.length ? " card-warn" : ""}`} ref={formRef}>
      <h2 style={{ marginTop: 0 }}>📝 あなたの登録内容</h2>

      {missing.length > 0 && (
        <p className="error" style={{ marginTop: 0 }}>
          ⚠ 未記入の項目があります: {missing.map((m) => MISSING_LABELS[m]).join("・")}
          <br />
          <span style={{ fontWeight: 400 }}>
            回覧のメールや緊急のご連絡が届かないことがあります。下から直せます。
          </span>
        </p>
      )}

      {!open ? (
        <>
          <dl className="profile-list">
            <dt>お名前</dt>
            <dd>{u.name || <span className="error">未記入</span>}</dd>
            {!hallOnly && (
              <>
                <dt>住所</dt>
                <dd>
                  {u.address ? `みどり町三丁目 ${u.address}` : <span className="error">未記入</span>}
                </dd>
                <dt>世帯主(代表者)</dt>
                <dd>{u.household_head || <span className="error">未記入</span>}</dd>
              </>
            )}
            <dt>電話番号</dt>
            <dd>{u.phone || <span className="error">未記入</span>}</dd>
            <dt>メールアドレス</dt>
            <dd>{u.email || <span className="error">未記入</span>}</dd>
          </dl>
          <button
            className={missing.length ? "btn btn-primary" : "btn btn-secondary btn-sm"}
            onClick={() => setOpen(true)}
          >
            {missing.length ? "登録内容を直す" : "登録内容を変える"}
          </button>
          {msg && <p className="ok-note">{msg}</p>}
        </>
      ) : (
        <>
          <label htmlFor="me-name">お名前(姓と名の間に空白を入れてください)</label>
          <input id="me-name" {...fieldProps("name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 太郎" />

          <label htmlFor="me-kana">ふりがな(任意)</label>
          <input id="me-kana" value={kana} onChange={(e) => setKana(e.target.value)} placeholder="やまだ たろう" />

          {!hallOnly && (
            <>
              <label htmlFor="me-address">住所(七丁目より後ろだけ)</label>
              <input
                id="me-address" {...fieldProps("address")} autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例: 1-1 / 1-1 ○○マンション203"
              />

              <p className="group-label">町内会に登録している世帯主(代表者)のお名前</p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={headSame}
                  onChange={(e) => setHeadSame(e.target.checked)}
                />
                <span>ご本人が世帯主(代表者)です</span>
              </label>
              {!headSame && (
                <input
                  value={householdHead}
                  onChange={(e) => setHouseholdHead(e.target.value)}
                  placeholder="例: 山田 一郎"
                />
              )}
              <p className="field-note">
                町内会は世帯ごとのご参加です。名義がご家族の場合はそのお名前をご記入ください。
              </p>
            </>
          )}

          <label htmlFor="me-phone">電話番号(ログインに使います)</label>
          <input
            id="me-phone" {...fieldProps("phone")} autoComplete="tel"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09012345678"
          />

          <label htmlFor="me-email">メールアドレス</label>
          <input
            id="me-email" {...fieldProps("email")} autoComplete="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="例: example@gmail.com"
          />
          <p className="field-note">回覧やお知らせをメールでもお届けします。</p>

          {err && (
            <p className="error-box" role="alert">
              {err}
            </p>
          )}
          <Btn
            className="btn btn-primary"
            busy={busy}
            busyLabel="保存中…"
            onClick={async () => {
              // 保存する前にこちらで確かめ、直すべき欄まで案内する
              if (!name.trim()) return fail("name", "お名前を入れてください。");
              if (!hallOnly && !address.trim())
                return fail("address", "住所(七丁目より後ろ)を入れてください。");
              if (phone.replace(/[^0-9]/g, "").length < 10)
                return fail("phone", "電話番号を、市外局番から入れてください。");
              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return fail("email", "メールアドレスの形をご確認ください(@のうしろも必要です)。");
              clear();
              setBusy(true);
              try {
                await api("/api/me", {
                  body: {
                    name,
                    kana,
                    address: hallOnly ? undefined : address,
                    household_head: hallOnly
                      ? undefined
                      : headSame
                        ? name.trim()
                        : householdHead,
                    email,
                    phone,
                  },
                });
                await refresh();
                setMsg("登録内容を更新しました。");
                setOpen(false);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "保存に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
          >
            この内容で保存する
          </Btn>
          <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
            やめる
          </button>
        </>
      )}
    </div>
  );
}

// 自分の会員レベル(役割)の表示と、変更依頼(オーナー指示: 自分がどの会員レベルか分かるように)
export function MyLevelCard() {
  const { me } = useMe();
  const roles = me?.user?.roles ?? [];
  const [req, setReq] = useState<{ status: string } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ request: { status: string } | null }>("/api/me/role-request")
      .then((d) => setReq(d.request))
      .catch(() => setReq(null));
  }, []);

  const pending = req?.status === "new";

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>👤 あなたの会員レベル</h2>
      <div className="row" style={{ marginBottom: 6 }}>
        {roles.length === 0 ? (
          <span className="chip chip-gray">{ROLE_LABELS.member}</span>
        ) : (
          roles.map((r) => (
            <span className="chip chip-green" key={r}>
              {ROLE_LABELS[r] ?? r}
            </span>
          ))
        )}
      </div>
      <p className="field-note">
        会員レベルによって、見られる回覧や使える機能が変わります。
      </p>

      {pending ? (
        <p className="ok-note">変更のご依頼を受け付けています。役員からの連絡をお待ちください。</p>
      ) : !open ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
          会員レベルの変更を依頼する
        </button>
      ) : (
        <>
          <label htmlFor="me-request">ご希望の内容</label>
          <textarea
            id="me-request"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="例: 子ども会に入ったので、子ども会の回覧も見られるようにしてほしい"
            style={{ minHeight: 90 }}
          />
          {err && <p className="error">{err}</p>}
          <div className="row">
            <Btn
              className="btn btn-primary btn-sm"
              busy={busy}
              onClick={async () => {
                setErr("");
                if (!message.trim()) {
                  setErr("ご希望の内容を入力してください");
                  return;
                }
                setBusy(true);
                try {
                  await api("/api/me/role-request", { body: { message } });
                  setMsg("ご依頼を送りました。役員が確認します。");
                  setOpen(false);
                  setMessage("");
                  setReq({ status: "new" });
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "送信に失敗しました");
                } finally {
                  setBusy(false);
                }
              }}
            >
              依頼を送る
            </Btn>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              やめる
            </button>
          </div>
        </>
      )}
      {msg && <p className="ok-note">{msg}</p>}
    </div>
  );
}

// ログイン方法の登録(Google / LINE)。登録しておくと次回から電話番号なしで入れる。
// LINEは「認証だけ」に使い、LINEアプリへ誘導したりLINE内で動かしたりはしない。
export function GoogleLinkCard() {
  const { me, refresh } = useMe();
  const clientId = me?.config.googleClientId;
  const lineOn = me?.config.lineLoginEnabled;
  const email = me?.user?.email ?? null;
  const hasLine = !!me?.user?.has_line;
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  // メール配信のオン/オフ。メール未登録・送信基盤が未設定なら出さない。
  const [mailOn, setMailOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!me?.config.mailEnabled || !me?.user?.email) setMailOn(null);
    else setMailOn(!me.user.email_optout);
  }, [me]);

  useEffect(() => {
    if (!clientId || email || !ref.current) return;
    renderGoogleButton(ref.current, clientId, async (credential) => {
      setErr("");
      try {
        await api("/api/me/link-google", { body: { credential } });
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "登録に失敗しました");
      }
    }).catch((e) => setErr(e instanceof Error ? e.message : ""));
  }, [clientId, email, refresh]);

  const unlink = async (kind: "google" | "line", label: string) => {
    if (!window.confirm(`${label}でのログインをやめますか?`)) return;
    setErr("");
    try {
      await api(`/api/me/unlink-${kind}`, { body: {} });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "解除できませんでした");
    }
  };

  if (!clientId && !lineOn) return null;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🔑 ログイン方法</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        登録しておくと、次回から電話番号を入力しなくてもログインできます。
      </p>

      {clientId &&
        (email ? (
          <div className="linked-row">
            <span className="ok-note">✅ Google({email})</span>
            <button className="btn btn-secondary btn-sm" onClick={() => unlink("google", "Google")}>
              解除
            </button>
          </div>
        ) : (
          <div ref={ref} />
        ))}

      {lineOn &&
        (hasLine ? (
          <div className="linked-row">
            <span className="ok-note">✅ LINEアカウント</span>
            <button className="btn btn-secondary btn-sm" onClick={() => unlink("line", "LINE")}>
              解除
            </button>
          </div>
        ) : (
          // 同意画面を必ず通すため、生のリンクではなく LineLoginButton を使う
          <LineLoginButton mode="link" />
        ))}

      {mailOn !== null && (
        <>
          <hr className="hr-soft" />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mailOn}
              onChange={async (e) => {
                const on = e.target.checked;
                setMailOn(on);
                try {
                  await api("/api/me/email-delivery", { body: { on } });
                  await refresh();
                } catch {
                  setMailOn(!on);
                  setErr("設定を保存できませんでした");
                }
              }}
            />
            回覧・お知らせをメールでも受け取る
          </label>
          <p className="field-note">
            メールの「確認しました」を押すと、アプリで押したのと同じ扱いになります。
          </p>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

type ReservationRow = {
  id: number;
  case_no: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
};
type MeetingRow = {
  id: number;
  title: string;
  date: string;
  deadline: string | null;
  status: string;
  answer: string | null;
};
// 未回答の会合・今後の予約(ホーム=公開トップに出す会員向けカード)
export function MemberTodoCards() {
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[] | null>(null);

  useEffect(() => {
    api<{ meetings: MeetingRow[] }>("/api/meetings")
      .then((d) => setMeetings(d.meetings))
      .catch(() => setMeetings([]));
    api<{ reservations: ReservationRow[] }>("/api/reservations/mine")
      .then((d) => setReservations(d.reservations))
      .catch(() => setReservations([]));
  }, []);

  const unanswered = meetings?.filter((m) => m.status === "open" && !m.answer) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming =
    reservations?.filter(
      (r) => r.date >= today && ["received", "checking", "approved"].includes(r.status),
    ) ?? [];

  return (
    <>
      {unanswered.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            未回答の会合 <span className="chip chip-red">{unanswered.length}件</span>
          </h2>
          {unanswered.slice(0, 3).map((m) => (
            <div className="list-item" key={m.id}>
              <Link to={`/app/meetings/${m.id}`} style={{ fontWeight: 700 }}>
                {m.title}
              </Link>
              {m.deadline && <div className="muted">回答期限: {fmtDate(m.deadline)}</div>}
            </div>
          ))}
          <Link className="btn btn-secondary" to="/app/meetings">
            会合を見る
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>会館の予約</h2>
          {upcoming.slice(0, 3).map((r) => (
            <div className="list-item" key={r.id}>
              <strong>
                {fmtDate(r.date)} {r.start_time}〜{r.end_time}
              </strong>{" "}
              <span className="chip chip-gray">{RESERVATION_STATUS_LABELS[r.status]}</span>
            </div>
          ))}
          <Link className="btn btn-secondary" to="/app/reservations">
            自分の予約を見る
          </Link>
        </div>
      )}
    </>
  );
}
