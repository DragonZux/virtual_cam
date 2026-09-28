import type { ThemeConfig } from "antd";

/** Màu dùng ngoài LESS (canvas, console…) — khớp theme.less */
export const BRAND = {
  primary: "#fb8020",
  primaryHover: "#f36c00",
  soft: "#fff3e8",
  text: "#333333",
  bg: "#f7f7f7",
};

/** Token antd khớp bảng màu trong theme.less */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorInfo: BRAND.primary,
    colorLink: BRAND.primaryHover,
    colorSuccess: "#52c41a",
    colorError: "#d9363e",
    colorBgLayout: BRAND.bg,
    colorText: BRAND.text,
    colorTextSecondary: "#707070",
    colorBorderSecondary: "#ebebeb",
    borderRadius: 10,
    fontFamily: '"Segoe UI", Arial, sans-serif',
  },
  components: {
    Card: { borderRadiusLG: 14 },
    Button: { fontWeight: 600 },
    Layout: { siderBg: "#ffffff", headerBg: "#ffffff", bodyBg: BRAND.bg },
    Menu: { itemBorderRadius: 9, itemSelectedBg: BRAND.soft, itemSelectedColor: BRAND.primaryHover, itemHeight: 46 },
  },
};
