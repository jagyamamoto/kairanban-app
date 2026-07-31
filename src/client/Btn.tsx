import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 押したあと「いま動いています」が必ず見えるボタン。
 *
 * これまでは通信中 disabled にするだけで文字が変わらなかったため、
 * 電波の弱いところでは「押したのに何も起きない」と見え、
 * 二度押しや離脱の原因になっていた。
 *
 * 使い方: <Btn className="btn btn-primary" busy={busy} onClick={...}>この内容で申し込む</Btn>
 */
export function Btn({
  busy,
  busyLabel = "送信中…",
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}) {
  return (
    <button {...rest} disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy ? busyLabel : children}
    </button>
  );
}
