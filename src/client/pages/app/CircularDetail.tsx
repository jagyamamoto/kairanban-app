// 回覧詳細: 「開いた」は自動記録、「確認しました」ボタンが正式な既読
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { fmtDate, fmtDateTime } from "../../util";
import { Btn } from "../../Btn";
import { refreshBadge } from "../../badge";

type Detail = {
  circular: {
    id: number;
    case_no: string;
    title: string;
    body: string;
    deadline: string | null;
    event_date: string | null;
    published_at: string;
    status: string;
    image_key: string | null;
  };
  confirmation: { opened_at: string | null; confirmed_at: string | null } | null;
};

export default function CircularDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Detail>(`/api/circulars/${id}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, [id]);

  if (err) {
    return (
      <div className="card">
        <p className="error">{err}</p>
        <Link className="btn btn-secondary" to="/app/circulars">
          回覧一覧へもどる
        </Link>
      </div>
    );
  }
  if (!data) return <p className="muted">読み込み中…</p>;

  const c = data.circular;
  const confirmed = data.confirmation?.confirmed_at;

  return (
    <div>
      <Link to="/app/circulars">← 回覧一覧へもどる</Link>
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>{c.title}</h2>
        <p className="muted">
          {c.case_no} ・ 掲載: {fmtDateTime(c.published_at)}
        </p>
        {c.event_date && (
          <p style={{ margin: "6px 0" }}>
            <span className="chip chip-red">実施日: {fmtDate(c.event_date)}</span>
          </p>
        )}
        {c.deadline && (
          <p>
            <span className="chip chip-orange">確認期限: {fmtDate(c.deadline)}</span>
          </p>
        )}
        {c.image_key && (
          <img
            src={`/api/images/circular/${c.id}`}
            alt=""
            style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0" }}
          />
        )}
        <p className="pre">{c.body}</p>
      </div>

      {c.status === "archived" ? (
        <p className="muted center">この回覧は終了しています。</p>
      ) : confirmed ? (
        <div className="card center">
          <div className="big-icon">✅</div>
          <p className="ok-note">確認済み({fmtDateTime(confirmed)})</p>
        </div>
      ) : (
        <>
          <Btn
            className="btn btn-primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/circulars/${c.id}/confirm`, { body: {} });
                const d = await api<Detail>(`/api/circulars/${c.id}`);
                setData(d);
                // アイコンの未読の数をすぐ減らす(戻ってくるまで古い数が残らないように)
                void refreshBadge();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "確認の記録に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
          >
            確認しました
          </Btn>
          <p className="muted center">
            「確認しました」を押すと、読んだことが町内会に伝わります。
          </p>
        </>
      )}
    </div>
  );
}
