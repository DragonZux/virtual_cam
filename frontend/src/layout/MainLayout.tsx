import { Button, Layout, Menu } from "antd";
import { LayoutGrid, Settings, Target, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { ROUTES, type RouteKey } from "@/common/constants";
import type { LiveState } from "@/common/types";
import { LivePage } from "@/page/Live";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getLiveState, visionActions } from "@/store/vision";
import styles from "./layout.module.less";

const NAV_ITEMS: { key: RouteKey; icon: LucideIcon }[] = [
  { key: "live", icon: LayoutGrid },
  { key: "settings", icon: Settings },
];

const PILL_TONE: Record<LiveState, "live" | "error" | "neutral"> = {
  connecting: "neutral",
  offline: "error",
  error: "error",
  starting: "neutral",
  ready: "neutral",
  waiting: "neutral",
  live: "live",
  paused: "neutral",
  reconnecting: "error",
};

const routeKeyOf = (pathname: string): RouteKey => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (Object.keys(ROUTES) as RouteKey[]).find((key) => ROUTES[key] === path) ?? "live";
};

export const MainLayout = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = routeKeyOf(pathname);
  const isLive = current === "live";
  const liveState = useAppSelector(getLiveState);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    dispatch(visionActions.startStatusPolling());
    dispatch(visionActions.startSelectionStream());
    return () => {
      dispatch(visionActions.stopStatusPolling());
      dispatch(visionActions.stopSelectionStream());
    };
  }, [dispatch]);

  useEffect(() => {
    document.title = `${t(`nav.${current}`)} · ${t("app.title")}`;
  }, [current, t]);

  const today = new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(),
  );
  return (
    <Layout className={styles.shell}>
      <Layout.Sider
        width={232}
        collapsedWidth={78}
        breakpoint="lg"
        collapsed={collapsed}
        onBreakpoint={setCollapsed}
        trigger={null}
        theme="light"
        className={styles.sider}
      >
        <Link to={ROUTES.live} className={styles.brand} aria-label={t("app.home")}>
          <span className={styles.brandMark}>
            <Target size={26} strokeWidth={1.5} />
          </span>
          {!collapsed && (
            <span className={styles.brandText}>
              hicas<span>cam</span>
              <small>{t("app.tagline")}</small>
            </span>
          )}
        </Link>
        {!collapsed && <div className={styles.navLabel}>{t("nav.section")}</div>}
        <Menu
          mode="inline"
          selectedKeys={[current]}
          className={styles.menu}
          aria-label={t("nav.main")}
          items={NAV_ITEMS.map(({ key, icon: Icon }) => ({ key, icon: <Icon size={18} />, label: t(`nav.${key}`) }))}
          onClick={({ key }) => navigate(ROUTES[key as RouteKey])}
        />
        {!collapsed && (
          <div className={styles.siderCard}>
            <strong>{t("sidebar.cardTitle")}</strong>
            <p>{t("sidebar.cardText")}</p>
            <div className={styles.localTag}>
              <span className={styles.dot} />
              {t("sidebar.tag")}
            </div>
          </div>
        )}
      </Layout.Sider>

      <Layout>
        <Layout.Header className={styles.header}>
          <div className={styles.breadcrumb}>
            {t("header.workspace")} <span>/</span> <strong>{t(`nav.${current}`)}</strong>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.date}>{today}</span>
            <Button
              size="small"
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith("en") ? "vi" : "en")}
              aria-label={t("header.switchLanguageLabel")}
            >
              {t("header.switchLanguage")}
            </Button>
            <span className={styles.avatar} aria-label={t("header.viewer")}>
              V
            </span>
          </div>
        </Layout.Header>

        <Layout.Content className={styles.content}>
          <section className={styles.heading}>
            <div>
              <div className={styles.eyebrow}>{t("page.eyebrow")}</div>
              <h1>{t(`page.${current}.title`)}</h1>
              <p>{t(`page.${current}.description`)}</p>
            </div>
            <span className={`${styles.pill} ${styles[PILL_TONE[liveState]]}`} role="status">
              <span className={styles.dot} />
              {t(`status.${liveState}`)}
            </span>
          </section>

          <div className={isLive ? undefined : styles.hidden}>
            <LivePage visible={isLive} />
          </div>
          {!isLive && <Outlet />}
        </Layout.Content>
      </Layout>

      <nav className={styles.bottomNav} aria-label={t("nav.main")}>
        {NAV_ITEMS.map(({ key, icon: Icon }) => (
          <NavLink
            key={key}
            to={ROUTES[key]}
            end
            className={({ isActive }) => (isActive ? styles.bottomActive : undefined)}
          >
            <Icon size={19} />
            <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </Layout>
  );
};
