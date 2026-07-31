// 監査ログ: 誰が・いつ・何を変更したか
import { useEffect, useState } from "react";
import { api } from "../../api";
import { fmtDateTime } from "../../util";

type Row = {
  id: number;
  at: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  "person.register": "利用登録",
  "person.update_self": "本人情報の更新",
  "auth.setup_admin": "管理者の有効化",
  "member.approve": "会員承認",
  "member.reject": "会員登録の却下",
  "member.create_proxy": "会員の代理登録",
  "member.update": "会員情報の更新",
  "member.role_grant": "役割の付与",
  "member.role_end": "役割の終了",
  "member.leave": "退会処理",
  "group.create": "グループ作成",
  "group.add_member": "グループへ追加",
  "group.remove_member": "グループから除外",
  "circular.create": "回覧の作成",
  "circular.update": "回覧の編集",
  "circular.submit": "回覧の承認依頼",
  "circular.publish": "回覧の公開",
  "circular.archive": "回覧の終了",
  "circular.confirm": "回覧の確認",
  "circular.proxy_confirm": "回覧の代理確認",
  "circular.remind": "リマインド送信",
  "circular.translate": "翻訳の実行",
  "circular.translation_review": "翻訳の手直し",
  "reservation.create": "予約申請",
  "reservation.create_proxy": "予約の代理申請",
  "reservation.claim": "予約の担当引受",
  "reservation.status": "予約の状態変更",
  "reservation.cancel": "予約の取消",
};

export default function Audit() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [usage, setUsage] = useState<{ month: string; sent: number; freeLimit: number } | null>(
    null,
  );

  useEffect(() => {
    api<{ audit: Row[] }>("/api/admin/audit?limit=200")
      .then((d) => setRows(d.audit))
      .catch(() => setRows([]));
    api<{ month: string; sent: number; freeLimit: number }>("/api/admin/notifications/usage")
      .then(setUsage)
      .catch(() => {});
  }, []);

  return (
    <div>
      {usage && (
        <div className="card">
          <strong>今月のLINE通知使用量</strong>
          <p style={{ margin: "4px 0 0" }}>
            {usage.month}: {usage.sent} / {usage.freeLimit}通(無料枠)
          </p>
        </div>
      )}
      <h2>操作の記録</h2>
      {rows === null && <p className="muted">読み込み中…</p>}
      <table className="simple">
        <thead>
          <tr>
            <th>日時</th>
            <th>操作者</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.at)}</td>
              <td>{r.actor_name ?? "-"}</td>
              <td>
                {ACTION_LABELS[r.action] ?? r.action}
                {r.target_id && <span className="muted"> #{r.target_id}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
