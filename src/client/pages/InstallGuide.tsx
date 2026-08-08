// ホーム画面追加の案内(オーナー実機テストの指摘 2026-07-30 を反映・記憶ゼロ設計)。
//
// 【なぜ時間で進める方式をやめたか】
// 初版は8秒ごとに指示を自動で進めていたが、オーナーの実機テストで
// 「帯の指示」と「実際に開いている画面」が食い違うことが判明した
// (何も開いていないのに『白い紙の中』、メニューなのに『青い追加』等)。
// 高齢者は自分のペースで進むため、時間による進行は必ずズレる。
// → **進行をやめ、4つの手順を実物のスクリーンショット付きで常時ぜんぶ出す**。
//    利用者は「いま自分の画面に出ているもの」と写真を見比べて選ぶだけでよい
//    (再認のみ。記憶も待ちも不要)。
//
// 【見た目をアプリと変える理由】
// 初版はアプリと同じ緑・同じ書体だったため「指示」に見えなかった(オーナー指摘)。
// → 黄色地+黒文字(道路標識と同じ最高コントラスト)にしてアプリ本体と明確に分ける。
//
// 【共有シートに隠れない位置】
// 実機検証で画面の上から約43%は共有シートに覆われないことを確認済み
// (iPhone 17e・SE 3rd gen)。帯はその範囲に収める。
// docs/使い方ガイド設計方針_記憶ゼロ設計.md に実測値あり。
// 【ここが「ホーム画面に追加」の案内の唯一の置き場所】
// 以前は public/help/index.html にも同じ手順があり、実際に食い違いが起きていた
// (静的ガイド側には「共有の画面を開くと説明は見えなくなります」という、
//  実機検証で否定された前提が残っていた)。
// → 手順はこのファイルだけに置く。静的ガイドは「アプリ内の案内を開いてください」
//    への短い誘導だけにしてある。**手順を静的ガイド側へ書き戻さないこと。**
import { useEffect, useRef, useState } from "react";
import { ORG } from "../../shared/org";
import { api } from "../api";
import { useMe } from "../me";
import { onInstallAvailable, promptInstall } from "../install";

const DISMISS_KEY = "installGuideClosed";
const WELCOME_KEY = "pwaWelcomeDone";
// どの町会のサイトでも正しく動くよう、いま開いているアドレスを使う
const APP_URL = window.location.origin;
const INJECTED_TITLE = "↓ホーム画面に追加を押す";

type Step = { img?: string; alt?: string; label: string };

// iPhone(Safari)の手順。写真は実機の切り抜き。文字が写真に入っているものには注記を付けない
// (画面に出ている文字と写真が一対一で対応するようにする)。
const IOS_STEPS: Step[] = [
  {
    img: "/help/img/t1-dots.png",
    alt: "画面の右下にある点3つのボタン",
    label: "画面の右下の …マークを押す",
  },
  { img: "/help/img/t2-share.png", alt: "共有と書かれた行", label: "「共有」を押す" },
  {
    img: "/help/img/t3b-showmore.png",
    alt: "表示を増やすボタン",
    label: "「表示を増やす」を押す",
  },
  {
    img: "/help/img/t3-addhome.png",
    alt: "ホーム画面に追加と書かれた行",
    label: "「ホーム画面に追加」を押す",
  },
  { img: "/help/img/t4-add.png", alt: "右上の青い追加ボタン", label: "右上の「追加」を押す" },
];

// Android(Chrome)の手順。**写真は付けない。**
// Androidはメーカーごとにメニューの見た目が違い、合わない写真は
// 「自分のと違う」と手を止めさせる。位置を言葉で書くほうが確実。
//
// ⚠ 以前は「Androidには手順を出さない。1回押すだけが使えるときだけボタンを出す」
//   としていた(2026-07-30)。しかしこの前提が 2026-08-09 の実機テストで崩れた。
//   `beforeinstallprompt` は非同期で遅れて届き、そもそも届かないブラウザもある。
//   届く前に判定していたため、AndroidなのにiOS用の「Safariで開いてください」が出た。
//   → Androidにも手動の手順を用意し、いつでも案内できるようにした。
const ANDROID_STEPS: Step[] = [
  { label: "画面の右上の、たて に3つ ならんだ点を押す" },
  { label: "「アプリをインストール」を押す。無いときは「ホーム画面に追加」を押す" },
  { label: "出てきた画面の「インストール」を押す。「追加」と出ることもある" },
];

/**
 * Androidの `beforeinstallprompt` は**ページ表示より遅れて届く**。
 * 実機で 200〜800ms 程度。余裕を見て、この時間だけ待ってから最初の画面を出す。
 * 待たずに描くと「はじめる」(手動)を先に見せてしまい、直後に
 * 「1回押すだけ」へ化けて利用者を驚かせる。
 */
const ANDROID_PROMPT_GRACE_MS = 1200;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

// iOSのSafari本体か(LINE・Gmail・Chrome(CriOS)などのアプリ内ブラウザを除外)。
// 除外された場合は mode="safari" になり、手順ではなく
// 「Safariで開いてください」+アドレスのコピーを出す。
//
// ⚠ LINEミニアプリ(LIFF)を将来有効にするときの注意:
//    LIFFで開いた利用者はLINEの中で完結するので、ホーム画面に追加する必要がない。
//    その場合はこの案内そのものを出さないほうがよい。
//    HANDOFF.md の T1(LINEミニアプリ接続)が動くときに、ここへ
//      if (isInLiff()) return "no-guide";   // LIFF利用者には設定案内を出さない
//    のような分岐を1つ足せば済むようにしてある(今は Line/ を除外リストに置くだけ)。
//    ⚠ Line/ を除外リストから外さないこと。LINEのアプリ内ブラウザからは
//      ホーム画面に追加できないため、手順を出すと詰む。
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  if (!isIOS()) return false;
  return !/CriOS|FxiOS|EdgiOS|Line\/|FBAN|FBAV|Instagram|GSA\/|YJApp/i.test(ua);
}

// Androidのアプリ内ブラウザ(LINE・Facebook・Instagram等)か。
// ここからはホーム画面に追加できないので、外のブラウザへ逃がすしかない。
// `; wv)` はAndroid標準のWebViewが名乗る印。
function isAndroidInApp(): boolean {
  if (!isAndroid()) return false;
  return /Line\/|FBAN|FBAV|Instagram|Twitter|; wv\)/i.test(navigator.userAgent);
}

// 通知が「許可」になっているか。iOSはホーム画面のアイコンから開いたときだけ聞かれる。
function notificationsGranted(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function CopyUrlButton({ android }: { android: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-primary"
      style={{ fontSize: 18, minHeight: 56 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(APP_URL);
          setCopied(true);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = APP_URL;
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
            setCopied(true);
          } catch {
            // 失敗したらボタンの文字は変えない(押し直してもらう)
          }
          document.body.removeChild(ta);
        }
      }}
    >
      {copied
        ? android
          ? "✅ コピーしました。次はChromeを開いてください"
          : "✅ コピーしました。次はSafariを開いてください"
        : "📋 このページのアドレスをコピーする"}
    </button>
  );
}

// 画面上部に固定する案内。手順を常時ぜんぶ表示する(自動で進めない)。
function GuideBand({
  steps,
  place,
  onDismiss,
  onRestart,
}: {
  steps: Step[];
  /**
   * ⚠ 帯は押すボタンと**反対側**に置く。同じ側だと自分でボタンを隠す。
   *   Safari(…は画面の下) → "top" / Android Chrome(⋮は画面の右上) → "bottom"
   */
  place: "top" | "bottom";
  onDismiss: () => void;
  onRestart: () => void;
}) {
  const originalTitle = useRef(document.title);

  // 共有の画面の中(最上部のタイトル欄)にも指示を出す。実機検証で確認済みの効果。
  // ⚠ iOSだけ。Androidの「ホーム画面に追加」は document.title ではなく
  //   manifest の名前を出すので、書き換えても意味がなく、タブの題名が変わるだけ。
  useEffect(() => {
    if (!isIOS()) return;
    document.title = INJECTED_TITLE;
    const prev = originalTitle.current;
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div
      className={`ig-band${place === "bottom" ? " ig-band-bottom" : ""}`}
      role="region"
      aria-label="ホーム画面に追加する手順"
    >
      <div className="ig-band-head">
        <span className="ig-band-title">設定方法</span>
        <span className="ig-band-label">1から順に押していってください</span>
        <button className="ig-band-close" onClick={onDismiss} aria-label="やめる">
          ×
        </button>
      </div>

      <ol className="ig-steps">
        {steps.map((s, i) => (
          <li className="ig-step-row" key={s.label}>
            <span className="ig-step-num">{i + 1}</span>
            {s.img && <img className="ig-step-img" src={s.img} alt={s.alt} />}
            <span className="ig-step-where">{s.label}</span>
          </li>
        ))}
      </ol>

      {/* 押すものが見つからないときの退避。実際には黄色い帯のどこを押しても
          開いているメニューが閉じて最初の画面に戻るが、「どこでも押せる」では
          伝わらないので、押せる場所をボタンとして見せる(オーナー指摘)。 */}
      <button className="ig-band-back" onClick={onRestart}>
        押すものが見つからない → さいしょの画面にもどる
      </button>
    </div>
  );
}

export default function InstallGuide({
  openNow,
  onOpened,
}: {
  /** ☰メニューの「最初の設定」から開かれたとき true */
  openNow?: boolean;
  onOpened?: () => void;
} = {}) {
  const { me } = useMe();
  const [mode, setMode] = useState<
    "hidden" | "welcome" | "notify" | "intro" | "guide" | "safari" | "reopen"
  >("hidden");
  // Android/Chromeは「1回押すだけ」で追加できることがある。使えるかどうかを見ておく。
  const [oneTap, setOneTap] = useState(false);
  useEffect(() => onInstallAvailable(setOneTap), []);

  const android = isAndroid();
  const steps = android ? ANDROID_STEPS : IOS_STEPS;

  // 案内の入口。
  // ・iPhoneのSafari本体 → 写真つきの手順を出す
  // ・Android → 「1回押すだけ」が使えればそのボタン、使えなければ文字の手順
  // ・アプリ内ブラウザ(LINE等) → 外のブラウザで開き直してもらう
  //
  // ⚠ Androidを `oneTap` で判定してはいけない。ここが 2026-08-09 まで入っていた不具合。
  //   `beforeinstallprompt` は遅れて届き、届かないブラウザもある
  //   (Firefox・Samsung Internet・メーカー製ブラウザ)。届く前に判定すると
  //   canGuideHere が false になり、**AndroidなのにiOS用の案内**が出た。
  const canGuideHere = android ? !isAndroidInApp() : isIOSSafari();
  const entryMode = (): "intro" | "safari" => (canGuideHere ? "intro" : "safari");
  // 閉じたあとは、手順を出せる端末には必ず小さな入口を残す。
  const closedMode = (): "reopen" | "hidden" => (canGuideHere ? "reopen" : "hidden");

  // Androidでは beforeinstallprompt を少しだけ待ってから最初の画面を出す。
  const [promptSettled, setPromptSettled] = useState(!android);
  useEffect(() => {
    if (promptSettled) return;
    if (oneTap) {
      setPromptSettled(true);
      return;
    }
    const id = window.setTimeout(() => setPromptSettled(true), ANDROID_PROMPT_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [promptSettled, oneTap]);

  useEffect(() => {
    if (isStandalone()) {
      // ホーム画面のアイコンから起動できている=設定済み。
      // サーバに記録しておき、次にSafariで開いたときは案内を出さない
      // (iOSはSafariとホーム画面アプリで保存領域が別なので端末側では判定できない)。
      api("/api/me/installed", { body: {} }).catch(() => {});
      if (!localStorage.getItem(WELCOME_KEY)) setMode("welcome");
      return;
    }
    // iPhoneとAndroidの両方を案内する。
    // ⚠ 以前はAndroidを静的ガイド側に任せていたが、手順が2か所に分かれて
    //   食い違いの原因になったため、案内はここに一本化した。
    if (!isIOS() && !android) return; // パソコンには出さない
    if (me?.user?.pwa_installed) return; // 設定済みが分かっている人には出さない
    if (!promptSettled) return; // Androidは beforeinstallprompt を待ってから出す
    // ⚠ 一度閉じても「二度と出ない」にはしない。間違って閉じた人が次に何をすれば
    //   よいか分からなくなるため、閉じたあとは小さな入口(reopen)を必ず出す。
    // ⚠ 依存に oneTap を入れないこと。あとから届いたときに mode が intro へ
    //   巻き戻り、手順の途中の人が最初の画面に戻される。
    //   「1回押すだけ」への切り替えは intro の描画側が oneTap を見て行う。
    if (localStorage.getItem(DISMISS_KEY)) {
      setMode(closedMode());
      return;
    }
    setMode(entryMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user?.pwa_installed, promptSettled]);

  // ☰メニューから呼ばれたら、閉じていても必ず開く
  useEffect(() => {
    if (!openNow) return;
    localStorage.removeItem(DISMISS_KEY);
    setMode(entryMode());
    onOpened?.();
  }, [openNow, onOpened]);

  if (mode === "hidden") return null;

  // 閉じたら、その場で小さな入口(reopen)に切り替える。
  // ⚠ ここで "hidden" にすると、間違って閉じた人はリロードするまで入口が出ず、
  //   次に何をすればよいか分からなくなる(オーナー実機テストの指摘 2026-07-30)。
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setMode(closedMode());
  };

  // 閉じたあとの小さな入口。押せばいつでも設定に戻れる。
  if (mode === "reopen") {
    return (
      <button
        className="ig-reopen"
        onClick={() => {
          localStorage.removeItem(DISMISS_KEY);
          setMode("intro");
        }}
      >
        ここから最初の設定をする
      </button>
    );
  }

  if (mode === "welcome") {
    return (
      <div className="card ig-card ig-welcome">
        <h2 className="ig-title">設定できました</h2>
        <img className="ig-done-icon" src="/icons/icon-192.png" alt="ホーム画面のアイコン" />
        <p className="ig-body">次回からも、ホーム画面のこのアイコンを押してください。</p>
        <button
          className="btn btn-primary ig-big-btn"
          onClick={() => {
            // 通知が「許可」になっていない人にだけ、次の1画面を出す。
            // すでに許可済みの人に「許可を押して」と言うと混乱するため。
            if (notificationsGranted()) {
              localStorage.setItem(WELCOME_KEY, "1");
              setMode("hidden");
            } else {
              setMode("notify");
            }
          }}
        >
          つぎへ
        </button>
      </div>
    );
  }

  // 通知の「許可」の案内。ここを押し忘れると回覧が届かない=最重要。
  // ⚠ この1画面を消さないこと。「許可」を押さなかった人には
  //   新しい回覧が出てもお知らせが届かない(役員が気づけない)。
  if (mode === "notify") {
    const blocked = typeof Notification !== "undefined" && Notification.permission === "denied";
    const finish = () => {
      localStorage.setItem(WELCOME_KEY, "1");
      setMode("hidden");
    };
    return (
      <div className="card ig-card">
        <h2 className="ig-title">あと1つだけ、大切なお願い</h2>
        <p className="ig-body">
          このあと下のような確認が出たら、<strong>右の「許可」を押してください。</strong>
        </p>
        {/* 実物と同じ見た目の見本。押す場所を写真と同じ形で見せる */}
        <div
          className="ig-notify-mock"
          role="img"
          aria-label="通知の確認画面。右側の許可を押します"
        >
          <p className="ig-notify-text">
            “{ORG.name}”が通知を送信します。よろしいですか?
          </p>
          <div className="ig-notify-btns">
            <span className="ig-notify-no">許可しない</span>
            <span className="ig-notify-yes">許可</span>
          </div>
        </div>
        <p className="ig-notify-why">
          「許可」を押さないと、<strong>新しい回覧が出てもお知らせが届きません。</strong>
        </p>
        {blocked && (
          <p className="ig-body">
            この確認がもう出てこないときは、町会役員にお声がけください。
            メールでも回覧をお届けできます。
          </p>
        )}
        <button className="btn btn-primary ig-big-btn" onClick={finish}>
          わかりました
        </button>
      </div>
    );
  }

  // アプリ内ブラウザ(LINE等)。ここからはホーム画面に追加できない。
  // ⚠ 逃がす先は端末で違う。AndroidにSafariの案内を出すと、
  //   存在しないアプリを探させることになる(2026-08-09の実機報告)。
  if (mode === "safari") {
    return (
      <div className="card ig-card">
        <div className="spread">
          <h2 className="ig-title">
            {android
              ? "赤・黄・緑の輪の「Chrome」で開いてください"
              : "青いコンパスの「Safari」で開いてください"}
          </h2>
          <button className="btn btn-secondary btn-sm ig-close" onClick={dismiss}>
            × あとで
          </button>
        </div>
        <p className="ig-body">
          この画面では、ホーム画面への設定ができません。次の順で
          <strong>{android ? "Chrome" : "Safari"}</strong>に移ってください。
        </p>
        <ol className="ig-steps-list">
          <li>
            このボタンを押します(アドレスが自動で写されます)
            <div style={{ margin: "10px 0" }}>
              <CopyUrlButton android={android} />
            </div>
          </li>
          {android ? (
            <>
              <li>
                ホーム画面にもどって、赤・黄・緑の輪の<strong>Chrome</strong>を開きます
              </li>
              <li>
                画面上の<strong>住所欄を長押し</strong>して、<strong>「貼り付けて検索」</strong>
                を押します
              </li>
            </>
          ) : (
            <>
              <li>
                ホーム画面にもどって、青いコンパスの<strong>Safari</strong>を開きます
              </li>
              <li>
                画面下の<strong>住所欄を長押し</strong>して、
                <strong>「ペーストして開く」</strong>を押します
              </li>
            </>
          )}
        </ol>
      </div>
    );
  }

  // 設定中は背景(ふだんの画面)を完全に隠す。後ろが見えていると
  // 「いまどちらを操作すればよいか」が分からなくなる(オーナー指摘 2026-07-30)。
  if (mode === "guide")
    return (
      <div className="ig-fullscreen">
        <GuideBand
          steps={steps}
          place={android ? "bottom" : "top"}
          onDismiss={dismiss}
          onRestart={() => setMode("intro")}
        />
      </div>
    );

  // mode === "intro": 開始前の確認(誤りゼロ設計の安心保証をここで先に伝える)。
  // ⚠ アプリ本体と同じ緑にすると「設定の画面」だと分からない(オーナー指摘)。
  //   帯と同じ黄色にして、通常の画面とは別物であることを一目で示す。
  return (
    <div className="ig-fullscreen ig-fullscreen-center">
    <div className="ig-intro">
      <div className="ig-intro-head">
        <h2 className="ig-intro-title">町内会アプリを使う準備をします</h2>
        <button className="ig-band-close" onClick={dismiss} aria-label="あとで">
          ×
        </button>
      </div>
      {/* ⚠ oneTap は遅れて true になることがある。ここは毎回の描画で読み直すので、
          届いた瞬間に「1回押すだけ」へ切り替わる(mode は動かさない)。 */}
      <p className="ig-intro-body">
        {oneTap
          ? "下のボタンを1回押すだけで終わります。"
          : android
            ? "押すものの場所を画面の下に出しておきます。何も覚えなくて大丈夫です。"
            : "押すものの写真を画面の上に出しておきます。何も覚えなくて大丈夫です。"}
      </p>
      <p className="ig-intro-note">
        押し間違えても、途中でやめても、壊れたりお金がかかったりすることは絶対にありません。
      </p>
      <button
        className="ig-intro-btn"
        onClick={async () => {
          // 「1回押すだけ」が使えるならそれで終わり(Android/Chrome)。
          if (oneTap) {
            await promptInstall();
            return;
          }
          // iPhoneは写真つきの手順へ
          setMode("guide");
        }}
      >
        {oneTap ? "ホーム画面に追加する" : "はじめる"}
      </button>
    </div>
    </div>
  );
}
