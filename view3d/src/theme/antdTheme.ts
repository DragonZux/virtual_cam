import type { ThemeConfig } from "antd";

/** Màu dùng ngoài LESS (cảnh 3D, console…) — khớp theme.less và frontend/src/theme/antdTheme.ts */
export const BRAND = {
  primary: "#fb8020",
  primaryHover: "#f36c00",
  soft: "#fff3e8",
  softStrong: "#ffe4cc",
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
    Button: { fontWeight: 600 },
  },
};
