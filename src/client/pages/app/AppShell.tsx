// 会員アプリの枠: LINEログイン(LIFF)→承認待ち→本画面、下部ナビ
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "../../api";
import { liffGetIdToken } from "../../liff";
import { renderGoogleButton } from "../../google";
import { useMe } from "../../me";
import { LineLoginButton } from "../../lineconsent";
import { ROLE_LABELS } from "../../../shared/labels";
import { isHallUserOnly } from "../../../shared/roles";
import Circulars from "./Circulars";
import CircularDetail from "./CircularDetail";
import Reserve from "./Reserve";
import MyReservations from "./MyReservations";
import Meetings from "./Meetings";
import MeetingDetail from "./MeetingDetail";
import Documents from "./Documents";
import Album from "./Album";
import { Btn } from "../../Btn";
import { useFormErrors } from "../../formfocus";

const ADMIN_ROLES = [
  "admin",
  "senior_officer",
  "pr",
  "circular_manager",
  "hall_manager",
  "officer",
  "kodomo_officer",
  "seniors_member",
];

function Shell({ children, nav }: { children: ReactNode; nav?: boolean }) {
  const { me, refresh } = useMe();
  const showAdmin = me?.user?.roles.some((r) => ADMIN_ROLES.includes(r));
  // 会館予約者(貸館の外部利用者)には町会のメニューを出さない。
  // ⚠ サーバ側でも権限を切っているが、押しても403になるボタンを見せないための配慮。
  const hallOnly = isHallUserOnly(me?.user?.roles ?? []);
  return (
    <div>
      <div className="header">
        <div className="spread">
          <h1 style={{ margin: 0 }}>{me?.config.appName ?? "町内会アプリ"}</h1>
          {me?.user && (
            <div className="row" style={{ margin: 0, gap: 6 }}>
              <a
                className="btn btn-secondary btn-sm"
                style={{ margin: 0, background: "transparent", color: "#fff", borderColor: "#fff" }}
                href="/help/"
              >
                ❓ 使い方
              </a>
              <button
                className="btn btn-secondary btn-sm"
                style={{ margin: 0, background: "transparent", color: "#fff", borderColor: "#fff" }}
                onClick={async () => {
                  await api("/api/auth/logout", { body: {} });
                  await refresh();
                }}
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
        {me?.user && <div className="sub">{me.user.name} さん</div>}
      </div>
      <div className="container">
        {children}
      </div>
      {nav && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            <span className="nav-icon">🏠</span>ホーム
          </NavLink>
          {!hallOnly && (
            <>
              <NavLink to="/app/circulars">
                <span className="nav-icon">📋</span>回覧
              </NavLink>
              <NavLink to="/app/meetings">
                <span className="nav-icon">👥</span>会合
              </NavLink>
            </>
          )}
          <NavLink to="/app/reserve">
            <span className="nav-icon">🏢</span>会館予約
          </NavLink>
          {hallOnly ? (
            <NavLink to="/app/reservations">
              <span className="nav-icon">📅</span>予約状況
            </NavLink>
          ) : (
            <>
              <NavLink to="/app/documents">
                <span className="nav-icon">📄</span>資料
              </NavLink>
              <NavLink to="/app/album">
                <span className="nav-icon">📷</span>ブログ
              </NavLink>
            </>
          )}
          {showAdmin && (
            <NavLink to="/admin">
              <span className="nav-icon">⚙️</span>管理
            </NavLink>
          )}
        </nav>
      )}
    </div>
  );
}

// LINEアプリ内ブラウザかどうか(ミニアプリ入口の判定)
function inLineClient(): boolean {
  return /Line\//i.test(navigator.userAgent);
}

// Googleログインのボタン。GOOGLE_CLIENT_ID が未設定なら何も出さない。
function GoogleLoginButton({ mode }: { mode: "login" | "link" }) {
  const { me, refresh } = useMe();
  const clientId = me?.config.googleClientId;
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!clientId || !ref.current) return;
    renderGoogleButton(ref.current, clientId, async (credential) => {
      setErr("");
      try {
        const path = mode === "link" ? "/api/me/link-google" : "/api/auth/google";
        await api(path, { body: { credential } });
        if (mode === "link") setMsg("Googleアカウントを登録しました。次回からGoogleでログインできます。");
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "ログインに失敗しました");
      }
    }).catch((e) => setErr(e instanceof Error ? e.message : ""));
  }, [clientId, mode, refresh]);

  if (!clientId) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div ref={ref} />
      {msg && <p className="ok-note">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

// LINEログインが途中で失敗したときの案内(/app?line_error=... で戻ってくる)
function LineErrorNote() {
  const [msg, setMsg] = useState(() =>
    new URLSearchParams(window.location.search).get("line_error"),
  );
  if (!msg) return null;
  return (
    <p className="error" onClick={() => setMsg(null)}>
      {msg}
    </p>
  );
}

function PhoneLogin() {
  const { me, refresh } = useMe();
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>ログイン</h2>
      <LineErrorNote />
      <label htmlFor="login-phone">登録されているお電話番号を入力してください。</label>
      <input
        id="login-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="例: 09012345678"
        autoCorrect="off"
        style={{ letterSpacing: 1, fontSize: 22, textAlign: "center" }}
      />
      {err && <p className="error">{err}</p>}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="確認中…"
        onClick={async () => {
          setErr("");
          setBusy(true);
          try {
            await api("/api/auth/phone", { body: { phone } });
            await refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "ログインに失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        ログイン
      </Btn>
      <p className="muted">
        電話番号が登録されていない方は、役員までお声がけください。
        {me?.config.liffId && me?.config.lineLoginEnabled &&
          " LINEをお使いの方は、LINEのメニューから開くと自動でログインできます。"}
      </p>
      {(me?.config.googleClientId || me?.config.lineLoginEnabled) && (
        <>
          <hr className="hr-soft" />
          <p className="muted" style={{ marginBottom: 8 }}>
            {me?.config.lineLoginEnabled
              ? "GoogleやLINEを登録済みの方は、こちらからも入れます。"
              : "Googleアカウント(Gmail)を登録済みの方は、こちらからも入れます。"}
          </p>
          <GoogleLoginButton mode="login" />
          <LineLoginButton mode="login" />
        </>
      )}
    </div>
  );
}


// 会員登録の申請(ログイン画面に併設)。役員が全員を手入力するのは大変なため、
// 本人に申請してもらい役員が承認する。所属は自己申告で、承認時に役員が直せる。
const SIGNUP_ROLES: { key: string; label: string; note: string }[] = [
  { key: "member", label: "町内会員", note: "ふつうの会員の方" },
  { key: "kodomo_parent", label: "子ども会保護者", note: "お子様が子ども会に入っている" },
  { key: "seniors_member", label: ROLE_LABELS.seniors, note: `${ROLE_LABELS.seniors}の方` },
  { key: "officer", label: "町内会役員", note: "役員をしている" },
  { key: "kodomo_officer", label: "子ども会役員", note: "子ども会の役員" },
  { key: "hall_manager", label: "会館係", note: "会館の管理担当" },
];

function SignupForm({ onBack }: { onBack: () => void }) {
  const { me } = useMe();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [kana, setKana] = useState("");
  const [address, setAddress] = useState("");
  // 町内会は世帯ごとの参加。誰の名義で登録されているかを聞く(オーナー指示 2026-07-30)
  const [headSame, setHeadSame] = useState(true);
  const [householdHead, setHouseholdHead] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["member"]);
  const [note, setNote] = useState("");
  const [hp, setHp] = useState("");
  const [done, setDone] = useState<{ needsReview: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  // 入力もれは「その欄までスクロール＋赤枠」で示す
  const { formRef, err, setErr, fail, clear, fieldProps } = useFormErrors();
  // LINEから戻ってきた場合、本人情報はサーバ側の署名付きCookieに預けてある
  const [lineLinked, setLineLinked] = useState<{ name: string | null; email: string | null } | null>(
    null,
  );

  useEffect(() => {
    api<{ linked: boolean; name: string | null; email: string | null }>("/api/signup/line-state")
      .then((d) => setLineLinked(d.linked ? { name: d.name, email: d.email } : null))
      .catch(() => setLineLinked(null));
  }, []);

  const toggle = (r: string) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  if (done) {
    return (
      <div className="card center">
        <div className="big-icon">🎉</div>
        <h2>登録が完了しました</h2>
        <p>そのままお使いいただけます。次回からは、ご入力の電話番号でログインできます。</p>
        {done.needsReview.length > 0 && (
          <p className="muted">
            「{done.needsReview.map((r) => ROLE_LABELS[r] ?? r).join("・")}」については、
            役員が確認してから使えるようになります。しばらくお待ちください。
          </p>
        )}
        <button className="btn btn-primary" onClick={() => window.location.assign("/")}>
          はじめる
        </button>
      </div>
    );
  }

  return (
    <div className="card" ref={formRef}>
      <h2 style={{ marginTop: 0 }}>会員登録</h2>
      <p className="muted">
        対象エリアにお住まいの方はどなたでも登録できます。
        ご入力の内容は役員が確認します。
      </p>

      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="su-last">姓(必須)</label>
          <input
            id="su-last"
            autoComplete="family-name"
            {...fieldProps("last")}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="山田"
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="su-first">名(必須)</label>
          <input
            id="su-first"
            autoComplete="given-name"
            {...fieldProps("first")}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="太郎"
          />
        </div>
      </div>

      <label htmlFor="su-kana">ふりがな(任意)</label>
      <input
        id="su-kana"
        value={kana}
        onChange={(e) => setKana(e.target.value)}
        placeholder="やまだ たろう"
      />

      <label htmlFor="su-address">住所(必須・七丁目より後ろだけ)</label>
      <input
        id="su-address"
        {...fieldProps("address")}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="例: 1-1 / 1-1 ○○マンション203"
      />
      <p className="field-note">「みどり区みどり町三丁目」より後ろだけご記入ください。</p>

      <p className="group-label">町内会に登録している世帯主(代表者)のお名前</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={headSame} onChange={(e) => setHeadSame(e.target.checked)} />
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
        町内会は世帯ごとのご参加です。会費のお支払いなどが世帯主(代表者)のお名前になっている場合は、
        チェックを外してそのお名前をご記入ください。
        <br />
        役員をされている方がご本人でも、名義がご家族ということがあります。その場合もご記入ください。
      </p>

      <label htmlFor="su-phone">電話番号(必須・ログインに使います)</label>
      <input
        id="su-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        {...fieldProps("phone")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="09012345678"
      />
      <p className="field-note">この番号がそのままログインに使われます。</p>

      <div className="recommend-box">
        <label htmlFor="su-email">メールアドレス(強くおすすめします)</label>
        {lineLinked ? (
          <p className="ok-note">
            ✅ LINEで確認できました
            {lineLinked.email ? `(${lineLinked.email})` : ""}
          </p>
        ) : (
          <>
            <input
              id="su-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              {...fieldProps("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例: example@gmail.com"
            />
            <p className="field-note">
              回覧・お知らせをメールでもお届けします。紙の回覧を待たずに読めます。
              Gmailの方は、電話番号を入力しなくてもGoogleでログインできるようになります。
            </p>
            {/* LINEの案内はチャネルが有効なときだけ出す(メール取得権限が下りるまでは非表示) */}
            {me?.config.lineLoginEnabled && (
              <>
                <p className="field-note">LINEをお使いの方は、こちらからでも登録できます。</p>
                <LineLoginButton mode="signup" />
              </>
            )}
          </>
        )}
        <p className="field-note">
          {me?.config.lineLoginEnabled
            ? "メールもLINEもお持ちでない方は、空のままで申し込めます。その場合は紙の回覧でお届けします。"
            : "メールアドレスをお持ちでない方は、空のままで申し込めます。その場合は紙の回覧でお届けします。"}
        </p>
      </div>

      <p className="group-label">ご所属(あてはまるものを選んでください・複数可)</p>
      {SIGNUP_ROLES.map((r) => (
        <label className="checkbox-row" key={r.key}>
          <input type="checkbox" checked={roles.includes(r.key)} onChange={() => toggle(r.key)} />
          {r.label} — {r.note}
        </label>
      ))}
      <p className="field-note">
        わからない場合は「町内会員」だけで大丈夫です。役員が確認して正しく設定します。
      </p>

      <label>連絡事項(任意)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 3班です" />

      {/* ハニーポット(人には見えない。ボットが埋めたら無視する) */}
      <input
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
      />

      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          // 送る前にこちらで確かめ、直すべき欄まで自動で案内する
          if (!lastName.trim()) return fail("last", "姓を入れてください。");
          if (!firstName.trim()) return fail("first", "名を入れてください。");
          if (!address.trim()) return fail("address", "住所(七丁目より後ろ)を入れてください。");
          if (phone.replace(/[^0-9]/g, "").length < 10)
            return fail("phone", "電話番号を、市外局番から入れてください。");
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return fail("email", "メールアドレスの形をご確認ください(@のうしろも必要です)。");
          clear();
          setBusy(true);
          try {
            const r = await api<{ needsReview?: string[] }>("/api/public/signup", {
              body: {
                last_name: lastName,
                first_name: firstName,
                kana,
                address,
                household_head: headSame ? `${lastName} ${firstName}`.trim() : householdHead,
                phone,
                email,
                roles,
                note,
                hp,
              },
            });
            setDone({ needsReview: r.needsReview ?? [] });
          } catch (e) {
            setErr(e instanceof Error ? e.message : "送信に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        この内容で登録する
      </Btn>
      <button className="btn btn-secondary" onClick={onBack}>
        やめる(ログイン画面へ)
      </button>
    </div>
  );
}

function AdminSetup() {
  const { refresh } = useMe();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <details className="card">
      <summary className="muted" style={{ cursor: "pointer" }}>
        システム管理者の方はこちら
      </summary>
      <label>管理者コード</label>
      <input value={code} onChange={(e) => setCode(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await api("/api/auth/admin-setup", { body: { code } });
            await refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "コードが違います");
          }
        }}
      >
        管理者として有効化
      </button>
    </details>
  );
}

function DevLogin() {
  const { refresh } = useMe();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>開発用ログイン</h2>
      <p className="muted">テスト環境のみの入口です(本番では電話番号ログインになります)。</p>
      <label>お名前</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田" />
      {err && <p className="error">{err}</p>}
      <button
        className="btn btn-primary"
        onClick={async () => {
          try {
            await api("/api/auth/dev", { body: { name } });
            await refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "ログインに失敗しました");
          }
        }}
      >
        ログイン
      </button>
    </div>
  );
}

function Pending() {
  const { me, refresh } = useMe();
  const [name, setName] = useState(me?.user?.name ?? "");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  return (
    <div>
      <div className="card center">
        <div className="big-icon">⏳</div>
        <h2>町内会の承認待ちです</h2>
        <p>
          登録を受け付けました。役員が確認して承認すると、回覧の確認や会館予約が使えるようになります。
        </p>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>お名前の確認</h3>
        <p className="muted">
          本名と違う場合は修正してください(役員が本人確認に使います)。
        </p>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        {msg && <p className="ok-note">{msg}</p>}
        <button
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await api("/api/me", { body: { name } });
              setMsg("保存しました");
              await refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "保存に失敗しました");
            }
          }}
        >
          名前を保存する
        </button>
      </div>
      <details className="card">
        <summary className="muted">システム管理者の方はこちら</summary>
        <label>管理者コード</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} />
        {err && <p className="error">{err}</p>}
        <button
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await api("/api/auth/setup", { body: { code } });
              await refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "コードが違います");
            }
          }}
        >
          管理者として有効化
        </button>
      </details>
      <p className="center">
        <Link to="/">公開のお知らせを見る</Link>
      </p>
    </div>
  );
}

export default function AppShell() {
  const { me, loading, refresh } = useMe();
  const [err, setErr] = useState("");
  // LINEから会員登録の途中で戻ってきたら、そのまま申請フォームを開く
  const [showSignup, setShowSignup] = useState(
    () => new URLSearchParams(window.location.search).get("signup") === "line",
  );
  const attempted = useRef(false);

  useEffect(() => {
    if (loading || me?.user || attempted.current) return;
    const liffId = me?.config.liffId;
    // LIFF自動ログインはLINEアプリ内でのみ(PWAは電話番号ログインが主)
    if (!liffId || !inLineClient()) return;
    attempted.current = true;
    (async () => {
      try {
        const r = await liffGetIdToken(liffId);
        if (!r) return; // LINEのログイン画面へ移動中
        await api("/api/auth/line", {
          body: { idToken: r.idToken, displayName: r.displayName },
        });
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "LINEログインに失敗しました");
      }
    })();
  }, [loading, me, refresh]);

  if (loading) {
    return (
      <Shell>
        <p className="muted center">読み込み中…</p>
      </Shell>
    );
  }
  if (!me?.user) {
    if (me?.config.liffId && inLineClient()) {
      return (
        <Shell>
          <div className="card center">
            <p>LINEでログインしています…</p>
            {err && <p className="error">{err}</p>}
          </div>
        </Shell>
      );
    }
    if (showSignup) {
      return (
        <Shell>
          <SignupForm onBack={() => setShowSignup(false)} />
        </Shell>
      );
    }
    return (
      <Shell>
        <PhoneLogin />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>はじめての方</h2>
          <p className="muted">
            まだ登録がない方は、こちらから会員登録できます。すぐにお使いいただけます。
          </p>
          <button className="btn btn-primary" onClick={() => setShowSignup(true)}>
            会員登録する
          </button>
        </div>
        <AdminSetup />
        {me?.config.devMode && <DevLogin />}
        <p className="center">
          <Link to="/">公開のお知らせを見る</Link>
        </p>
      </Shell>
    );
  }
  if (me.user.status !== "active") {
    return (
      <Shell>
        <Pending />
      </Shell>
    );
  }
  return (
    <Shell nav>
      <Routes>
        {/* ホームは公開トップに一本化(オーナー指示: 同じ内容で、会員レベルにより表示が変わる) */}
        <Route index element={<Navigate to="/" replace />} />
        <Route path="circulars" element={<Circulars />} />
        <Route path="circulars/:id" element={<CircularDetail />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meetings/:id" element={<MeetingDetail />} />
        <Route path="reserve" element={<Reserve />} />
        <Route path="reservations" element={<MyReservations />} />
        <Route path="documents" element={<Documents />} />
        <Route path="album" element={<Album />} />
      </Routes>
    </Shell>
  );
}
