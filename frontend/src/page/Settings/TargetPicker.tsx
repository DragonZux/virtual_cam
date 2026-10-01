import { Button, Card, Empty, Input, Space, Tag } from "antd";
import { Search, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CLASS_GROUPS } from "@/common/constants";
import { ObjectIcon } from "@/components";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getActiveTargets, settingActions } from "@/store/setting";
import { getVisionStatus } from "@/store/vision";
import { classKey, objectLabel } from "@/utils/format";
import { notify } from "@/utils/notify";
import styles from "./settings.module.less";

/** "Bàn phím" → "ban phim": tìm không cần gõ dấu */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

/** Chia lớp của model theo nhóm COCO (so tên không phân biệt hoa / thường); lớp lạ (model tuỳ chỉnh) vào nhóm "other" */
const groupClasses = (classes: string[]) => {
  const byKey = new Map(classes.map((name) => [classKey(name), name]));
  const known = new Set(CLASS_GROUPS.flatMap((group) => group.classes));
  const groups = CLASS_GROUPS.map((group) => ({
    key: group.key,
    classes: group.classes.flatMap((name) => byKey.get(name) ?? []),
  })).filter((group) => group.classes.length);
  const other = classes.filter((name) => !known.has(classKey(name)));
  return other.length ? [...groups, { key: "other", classes: other }] : groups;
};

export const TargetPicker = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const status = useAppSelector(getVisionStatus);
  const active = useAppSelector(getActiveTargets);
  const [query, setQuery] = useState("");
  const classes = useMemo(() => status?.classes ?? [], [status?.classes]);
  const groups = useMemo(() => groupClasses(classes), [classes]);
  const activeSet = new Set(active);
  const needle = normalize(query);
  const matches = (name: string) =>
    !needle || normalize(objectLabel(t, name)).includes(needle) || normalize(name).includes(needle);

  const setTargets = (targets: string[] | undefined) => dispatch(settingActions.updatePreferences({ targets }));
  const toggle = (name: string, checked: boolean) => {
    const next = checked ? [...active, name] : active.filter((item) => item !== name);
    if (!next.length) {
      notify.warning(t("settings.targets.minOne"));
      return;
    }
    setTargets(next);
  };

  const visibleGroups = groups
    .map((group) => ({ ...group, classes: group.classes.filter(matches) }))
    .filter((group) => group.classes.length);

  return (
    <Card
      title={
        <span className={styles.cardTitle}>
          <Target size={17} />
          {t("settings.targets.title")}
        </span>
      }
      extra={
        classes.length > 0 && (
          <span className={styles.summary}>
            {t("settings.targets.summary", { count: active.length, total: classes.length })}
          </span>
        )
      }
    >
      {classes.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("settings.targets.waiting")} />
      ) : (
        <>
          <div className={styles.targetToolbar}>
            <Input
              allowClear
              prefix={<Search size={15} />}
              placeholder={t("settings.targets.search")}
              aria-label={t("settings.targets.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Space size={6} wrap>
              <Button size="small" onClick={() => setTargets(undefined)}>
                {t("settings.targets.defaults")}
              </Button>
              <Button size="small" onClick={() => setTargets([...classes])}>
                {t("settings.targets.all")}
              </Button>
            </Space>
          </div>
          <div className={styles.groups}>
            {visibleGroups.length === 0 && <div className={styles.noMatch}>{t("settings.targets.noMatch")}</div>}
            {visibleGroups.map((group) => (
              <section key={group.key} className={styles.group}>
                <h3>{t(`classGroups.${group.key}`)}</h3>
                <div className={styles.chips}>
                  {group.classes.map((name) => (
                    <Tag.CheckableTag
                      key={name}
                      className={styles.chip}
                      checked={activeSet.has(name)}
                      onChange={(checked) => toggle(name, checked)}
                    >
                      <ObjectIcon name={name} size={14} />
                      {objectLabel(t, name)}
                    </Tag.CheckableTag>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className={styles.hint}>{t("settings.targets.hint")}</p>
        </>
      )}
    </Card>
  );
};
