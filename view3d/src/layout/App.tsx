import { App as AntApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import viVN from "antd/locale/vi_VN";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";

import { ViewerPage } from "@/page/Viewer";
import store from "@/store";
import { antdTheme } from "@/theme/antdTheme";

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
        {/* Một màn hình duy nhất, không cần router: chạy được ở bất kỳ đường dẫn nào (/, /view3d/…) */}
        <ViewerPage />
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
