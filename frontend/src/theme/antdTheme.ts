import type { ThemeConfig } from "antd";

/** Token antd khớp bảng màu trong theme.less */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: "#087f70",
    colorInfo: "#087f70",
    colorSuccess: "#27a67b",
    colorError: "#bf514f",
    colorBgLayout: "#f5f7f9",
    colorText: "#1b2d37",
    colorTextSecondary: "#6f7f89",
    colorBorderSecondary: "#e8edef",
    borderRadius: 10,
    fontFamily: '"Segoe UI", Arial, sans-serif',
  },
  components: {
    Card: { borderRadiusLG: 14 },
    Button: { fontWeight: 600 },
    Layout: { siderBg: "#ffffff", headerBg: "#ffffff", bodyBg: "#f5f7f9" },
    Menu: { itemBorderRadius: 9, itemSelectedBg: "#e6f5ef", itemSelectedColor: "#087f70", itemHeight: 46 },
  },
};
