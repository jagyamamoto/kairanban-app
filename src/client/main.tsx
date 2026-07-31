import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";
import { initInstallPrompt } from "./install";
import { startBadgeSync } from "./badge";
import { ORG } from "../shared/org";
import { MeProvider } from "./me";
import PublicSite from "./pages/PublicSite";
import AppShell from "./pages/app/AppShell";
import AdminShell from "./pages/admin/AdminShell";

// beforeinstallprompt は描画前に飛ぶことがあるので、最初に捕まえる
initInstallPrompt();
// ホーム画面のアイコンに未読の数を出す(対応していない端末では何も起きない)
startBadgeSync();
// 画面のタイトルを町会名にそろえる(index.html を書き換え忘れても正しく出る)
document.title = ORG.name;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/app/*" element={<AppShell />} />
          <Route path="/admin/*" element={<AdminShell />} />
          <Route path="/*" element={<PublicSite />} />
        </Routes>
      </BrowserRouter>
    </MeProvider>
  </React.StrictMode>,
);
