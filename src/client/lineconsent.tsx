// LINEログインの導線と、その前に必ず出す同意画面。
// AppShell と Home の両方から使うため独立したモジュールに置いている(循環importを避ける)。
import { useState } from "react";
import { useMe } from "./me";
import { useOverlay } from "./useOverlay";

// LINEでログイン/連携するボタン。チャネル未設定なら何も出さない。
// ⚠ LINEアプリへ「遷移させる」のではなく、認証だけに使う(オーナー方針)。
//
// ⚠ LINEへ送る前に必ず LineConsent を表示する。LINEの「メールアドレス取得権限」は、
//    取得するもの・利用目的を利用者に明示して同意を得ている画面がある事が条件のため。
//    この画面を消したり素通りさせたりしないこと。
const LINE_BTN_LABEL: Record<string, string> = {
  login: "LINEでログイン",
  link: "LINEを登録する",
  signup: "LINEで登録する",
};

export function LineLoginButton({ mode }: { mode: "login" | "link" | "signup" }) {
  const { me } = useMe();
  const [asking, setAsking] = useState(false);
  if (!me?.config.lineLoginEnabled) return null;
  return (
    <>
      <button className="btn btn-line" onClick={() => setAsking(true)}>
        {LINE_BTN_LABEL[mode]}
      </button>
      {asking && <LineConsent mode={mode} onCancel={() => setAsking(false)} />}
    </>
  );
}

// LINEログインを使う前の説明と同意。LINEの審査で提出する画面でもある。
function LineConsent({
  mode,
  onCancel,
}: {
  mode: "login" | "link" | "signup";
  onCancel: () => void;
}) {
  // 「戻る」と Escape でも閉じられるようにする(同意ダイアログの出口を増やす)
  useOverlay(true, onCancel);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="LINE連携の確認">
      <div className="modal card">
        <h2 style={{ marginTop: 0 }}>LINEアカウントで本人確認します</h2>
        <p>
          町内会が<b>あなたのLINEから受け取る情報</b>と、その<b>使いみち</b>は次のとおりです。
        </p>

        <h3 className="consent-h">受け取る情報</h3>
        <ul className="consent-list">
          <li>
            <b>メールアドレス</b>
          </li>
          <li>LINEに登録されているお名前</li>
          <li>利用者を見分けるための番号(LINEユーザーID)</li>
        </ul>

        <h3 className="consent-h">使いみち</h3>
        <ul className="consent-list">
          <li>あなたが町内会の会員ご本人であることの確認(このアプリへのログイン)</li>
          <li>
            <b>回覧・お知らせを、いただいたメールアドレス宛にお送りするため</b>
            (見られる範囲の回覧だけをお送りします)
          </li>
        </ul>

        <h3 className="consent-h">しないこと</h3>
        <ul className="consent-list">
          <li>あなたのLINEにメッセージを送ることはありません</li>
          <li>友だち・トーク・電話番号を受け取ることはありません</li>
          <li>町内会の運営以外の目的に使ったり、他人に渡したりしません</li>
        </ul>

        <p className="muted">
          くわしくは
          <a href="/privacy" target="_blank" rel="noreferrer">
            個人情報の取扱いについて
          </a>
          をご覧ください。連携はあとから解除できます。
        </p>

        <a className="btn btn-line" href={`/api/auth/line/start?mode=${mode}`}>
          同意してLINEにすすむ
        </a>
        <button className="btn btn-secondary" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}
