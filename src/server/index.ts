// エントリポイント: APIルーティングとSPA配信・定期実行
import { Hono } from "hono";
import { type AppEnv, type Env, HttpError, attachUser } from "./core";
import auth, { meApp } from "./routes/auth";
import circulars, { adminCirculars, circularImages } from "./routes/circulars";
import reservations, { adminReservations, publicReservations } from "./routes/reservations";
import meetings, { adminMeetings } from "./routes/meetings";
import adminRoutes from "./routes/admin";
import publicApi from "./routes/publicApi";
import lineRoutes from "./routes/line";
import pushRoutes from "./routes/push";
import { publicSponsors, adminSponsors } from "./routes/sponsors";
import { publicPages, adminPages } from "./routes/pages";
import { publicApplications, adminApplications } from "./routes/applications";
import emailLinks from "./routes/emaillinks";
import shareLinks from "./routes/sharelinks";
import postsRoutes from "./routes/posts";
import dashboardRoutes from "./routes/dashboard";
import documentsRoutes, { adminDocuments } from "./routes/documents";
import signupRoutes from "./routes/signup";
import { runDailyReminders } from "./cron";
import { runReservationNotices } from "./reservationnotices";
import { runCircularEventNotices } from "./circularnotices";
import { ingestAreaAlerts } from "./areaalerts";

const app = new Hono<AppEnv>();

app.use("/api/*", attachUser);

app.route("/api/auth", auth);
app.route("/api", meApp); // /api/me
app.route("/api/public", publicApi);
app.route("/api/circulars", circulars);
app.route("/api/admin/circulars", adminCirculars);
app.route("/api/reservations", reservations);
app.route("/api/admin/reservations", adminReservations);
app.route("/api/meetings", meetings);
app.route("/api/admin/meetings", adminMeetings);
app.route("/api/admin", adminRoutes);
app.route("/api/line", lineRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/public/sponsors", publicSponsors);
app.route("/api/admin/sponsors", adminSponsors);
app.route("/api/public/pages", publicPages);
app.route("/api/admin/pages", adminPages);
app.route("/api/images/circular", circularImages);
app.route("/api/public/applications", publicApplications);
app.route("/api/admin/applications", adminApplications);
app.route("/api/public/signup", signupRoutes);
// 会館予約はログイン不要でも受け付ける(オーナー指示)。確定は会館係の承認が必要
app.route("/api/public/reservations", publicReservations);
app.route("/api/documents", documentsRoutes);
app.route("/api/admin/documents", adminDocuments);
// 写真アルバム(⚠ 一般公開なし・レベルで見せ分け)
app.route("/api/posts", postsRoutes);
// 管理ホーム(未読・未処理の一括表示)。権限のある項目だけ返す
app.route("/api/admin/dashboard", dashboardRoutes);
// 回覧メールの中のリンク(開封画像・確認・配信停止)。ログイン不要・署名付きトークンで認証
app.route("/api/e", emailLinks);
// 資料の共有リンク(ログイン不要・パスワード必須)。SPAではなくサーバ側でHTMLを返す
app.route("/s", shareLinks);

app.all("/api/*", (c) => c.json({ error: "APIが見つかりません" }, 404));

// SPA(静的アセット)へフォールバック
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error(err);
  return c.json({ error: "サーバーエラーが発生しました" }, 500);
});

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    // Cronは5分ごと(会館予約の「終了10分前」を出すため)。
    //  - 会館予約のお知らせ … 毎回(時刻の判定が要るので細かく回す)
    //  - 安全安心メールの取り込み … 15分に1回だけ(区のサイトへ毎回取りに行かない)
    //  - 日次リマインド … 自前の20時間ガードで1日1回
    const jstMin = new Date(Date.now() + 9 * 3600 * 1000).getUTCMinutes();
    ctx.waitUntil(
      (async () => {
        await runReservationNotices(env);
        // 回覧の実施日(7日前・前日・当日)のお知らせ。朝8時(JST)以降にだけ送る
        await runCircularEventNotices(env);
        if (jstMin % 15 < 5) await ingestAreaAlerts(env);
        await runDailyReminders(env);
      })(),
    );
  },
};
