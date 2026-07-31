// 管理画面の枠: 役割に応じてタブを出し分け
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { api } from "../../api";
import { useMe } from "../../me";
import Members from "./Members";
import CircularsAdmin from "./CircularsAdmin";
import MeetingsAdmin from "./MeetingsAdmin";
import ReservationsAdmin from "./ReservationsAdmin";
import SponsorsAdmin from "./SponsorsAdmin";
import PagesAdmin from "./PagesAdmin";
import ApplicationsAdmin from "./ApplicationsAdmin";
import RoleRequests from "./RoleRequests";
import DocumentsAdmin from "./DocumentsAdmin";
import Audit from "./Audit";
import AdminHome from "./AdminHome";

// 管理閲覧権限.xlsxに合わせたタブ表示ロール(サーバ側の権限グループと同じ範囲)
const MEETING_MANAGE = [
  "officer",
  "senior_officer",
  "hall_manager",
  "circular_manager",
  "pr",
  "kodomo_officer",
  "seniors_member",
  "admin",
];
const CIRCULAR_ACCESS = ["senior_officer", "pr", "circular_manager", "officer", "kodomo_officer", "admin"];
const HALL = ["hall_manager", "officer", "senior_officer", "admin"];

// 管理画面に入れる人なら誰でも見られる役割(未処理の一括表示。中身は権限で絞られる)
const ANY_ADMIN = [
  "officer",
  "senior_officer",
  "pr",
  "circular_manager",
  "hall_manager",
  "kodomo_officer",
  "seniors_member",
  "observer",
  "admin",
];

const TABS = [
  // 管理画面を開いたら最初にここへ来る(オーナー指示: 未処理を一括で見たい)
  { path: "home", label: "やること", roles: ANY_ADMIN, el: <AdminHome /> },
  { path: "members", label: "会員", roles: ["senior_officer", "admin"], el: <Members /> },
  {
    path: "circulars",
    label: "回覧",
    roles: CIRCULAR_ACCESS,
    el: <CircularsAdmin />,
  },
  { path: "meetings", label: "会合", roles: MEETING_MANAGE, el: <MeetingsAdmin /> },
  {
    path: "pages",
    label: "ページ",
    roles: ["senior_officer", "pr", "circular_manager", "admin"],
    el: <PagesAdmin />,
  },
  {
    path: "reservations",
    label: "会館予約",
    roles: HALL,
    el: <ReservationsAdmin />,
  },
  {
    path: "documents",
    label: "資料",
    roles: ["senior_officer", "admin"],
    el: <DocumentsAdmin />,
  },
  { path: "sponsors", label: "広告", roles: ["senior_officer", "admin"], el: <SponsorsAdmin /> },
  // 入会申込は町内会と子ども会で画面を分ける(オーナー指示 2026-07-30)。
  // ⚠ タブの出し分けは applicationKindsFor と同じ役割で決めること。
  //   町内会役員に子ども会の申込を、子ども会役員に町内会の申込を見せない。
  //   (サーバ側でも kind ごとに権限を見ているので、直接叩いても403になる)
  {
    path: "applications-chonai",
    label: "町内会入会",
    roles: ["officer", "senior_officer", "admin"],
    el: <ApplicationsAdmin kind="chonai" />,
  },
  {
    path: "applications-kodomo",
    label: "子ども会入会",
    roles: ["kodomo_officer", "senior_officer", "admin"],
    el: <ApplicationsAdmin kind="kodomo" />,
  },
  {
    path: "role-requests",
    label: "レベル変更依頼",
    roles: ["senior_officer", "admin"],
    el: <RoleRequests />,
  },
  { path: "audit", label: "記録", roles: ["senior_officer", "admin"], el: <Audit /> },
];

export default function AdminShell() {
  const { me, loading, refresh } = useMe();
  if (loading) return <p className="muted center">読み込み中…</p>;
  const user = me?.user;
  if (!user || user.status !== "active") {
    return (
      <div className="container">
        <div className="card">
          <p>ログインが必要です。</p>
          <Link className="btn btn-primary" to="/app">
            アプリを開く
          </Link>
        </div>
      </div>
    );
  }
  const visible = TABS.filter((t) => user.roles.some((r) => t.roles.includes(r)));
  if (visible.length === 0) {
    return (
      <div className="container">
        <div className="card">
          <p>管理画面を使う権限がありません。</p>
          <Link className="btn btn-secondary" to="/app">
            アプリへもどる
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="header">
        <div className="spread">
          <h1 style={{ margin: 0 }}>{me?.config.appName} 管理</h1>
          <div className="row" style={{ margin: 0, gap: 6 }}>
          <a
            className="btn btn-secondary btn-sm"
            style={{ margin: 0, background: "transparent", color: "#fff", borderColor: "#fff" }}
            href="/help/yakuin/"
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
        </div>
        <div className="sub">{user.name} さん</div>
      </div>
      <div className="container admin-with-nav">
        <div className="tabbar">
          {visible.map((t) => (
            <NavLink
              key={t.path}
              to={`/admin/${t.path}`}
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              style={{ textDecoration: "none" }}
            >
              {t.label}
            </NavLink>
          ))}
          <Link to="/" className="tab" style={{ textDecoration: "none" }}>
            🏠 ホーム
          </Link>
        </div>
        <Routes>
          {visible.map((t) => (
            <Route key={t.path} path={t.path} element={t.el} />
          ))}
          <Route path="*" element={<Navigate to={`/admin/${visible[0].path}`} replace />} />
        </Routes>
      </div>

      {/* 会員アプリと同じ下部ナビ(オーナー指示)。管理画面からも同じ操作感で行き来できる */}
      <nav className="bottom-nav">
        <NavLink to="/" end>
          <span className="nav-icon">🏠</span>ホーム
        </NavLink>
        <NavLink to="/app/circulars">
          <span className="nav-icon">📋</span>回覧
        </NavLink>
        <NavLink to="/app/meetings">
          <span className="nav-icon">👥</span>会合
        </NavLink>
        <NavLink to="/app/reserve">
          <span className="nav-icon">🏢</span>会館予約
        </NavLink>
        <NavLink to="/app/documents">
          <span className="nav-icon">📄</span>資料
        </NavLink>
        <NavLink to="/admin" className="active">
          <span className="nav-icon">⚙️</span>管理
        </NavLink>
      </nav>
    </div>
  );
}
