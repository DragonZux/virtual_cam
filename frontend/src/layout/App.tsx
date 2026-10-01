import { ConfigProvider, App as AntApp } from "antd";
import enUS from "antd/locale/en_US";
import viVN from "antd/locale/vi_VN";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ROUTES } from "@/common/constants";
import { GuidePage } from "@/page/Guide";
import { HistoryPage } from "@/page/History";
import { SettingsPage } from "@/page/Settings";
import { TestPage } from "@/page/Test/TestPage";
import store from "@/store";
import { antdTheme } from "@/theme/antdTheme";
import { AntdHolder } from "./AntdHolder";
import { MainLayout } from "./MainLayout";

/** Locale antd + thuộc tính lang của trang đi theo ngôn ngữ i18next */
const LocalizedApp = () => {
  const { i18n } = useTranslation();
  const english = i18n.language?.startsWith("en");

  useEffect(() => {
    document.documentElement.lang = english ? "en" : "vi";
  }, [english]);

  return (
    <ConfigProvider theme={antdTheme} locale={english ? enUS : viVN}>
      <AntApp>
        <AntdHolder />
        <BrowserRouter>
          <Routes>
            {/* Trang Tổng quan do MainLayout giữ mount liên tục (camera không tắt khi chuyển trang) */}
            <Route element={<MainLayout />}>
              <Route index element={null} />
              <Route path={ROUTES.test} element={<TestPage />} />
              <Route path={ROUTES.history} element={<HistoryPage />} />
              <Route path={ROUTES.settings} element={<SettingsPage />} />
              <Route path={ROUTES.guide} element={<GuidePage />} />
            </Route>
            <Route path="*" element={<Navigate to={ROUTES.live} replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

const App = () => (
  <Provider store={store}>
    <LocalizedApp />
  </Provider>
);

export default App;
