import { useEffect, useRef } from "react";

/**
 * ドロワーや確認ダイアログを、スマホの「戻る」とキーボードの Escape で閉じられるようにする。
 *
 * これがないと、Androidの戻るボタンを押したときにドロワーは開いたまま
 * 画面ごと前のページへ行ってしまう(「閉じ方が分からない」という迷い方をする)。
 * 背後の画面がスクロールしてしまう問題もここでまとめて止める。
 *
 * ⚠ close は毎回新しい関数が渡ってくる想定なので ref に逃がす。
 *   依存に close を入れると、再描画のたびに履歴を積んでしまう。
 */
export function useOverlay(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const onPop = () => closeRef.current();

    // 履歴を1つ積んでおき、「戻る」が来たら画面遷移ではなく閉じる動作にあてる
    window.history.pushState({ overlay: true }, "");
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prevOverflow;
      // 閉じるボタンで閉じたときは、積んだ履歴を戻しておく。
      // (戻るで閉じた場合はすでに消えているので、二重に戻らない)
      if (window.history.state?.overlay) window.history.back();
    };
  }, [open]);
}
