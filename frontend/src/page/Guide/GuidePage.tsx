import { Card, Col, Row } from "antd";
import { Info, Keyboard, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import styles from "./guide.module.less";

const STEPS = [1, 2, 3] as const;
const SHORTCUTS = [
  { key: "Space", label: "guide.shortcutSpace" },
  { key: "S", label: "guide.shortcutSnapshot" },
  { key: "F", label: "guide.shortcutFullscreen" },
] as const;

export const GuidePage = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <Row gutter={[20, 20]}>
        {STEPS.map((step) => (
          <Col key={step} xs={24} lg={8}>
            <Card className={styles.step}>
              <span className={styles.number}>{String(step).padStart(2, "0")}</span>
              <h2>{t(`guide.step${step}Title`)}</h2>
              <p>{t(`guide.step${step}Text`)}</p>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card className={styles.note}>
            <div className={styles.noteRow}>
              <Info size={20} />
              <div>
                <h2>{t("pointer.guideTitle")}</h2>
                <p>{t("pointer.guideText")}</p>
              </div>
            </div>
            <div className={styles.noteRow}>
              <Info size={20} />
              <div>
                <h2>{t("guide.tipsTitle")}</h2>
                <p>{t("guide.tipsText")}</p>
              </div>
            </div>
            <div className={styles.noteRow}>
              <ShieldCheck size={20} />
              <p>{t("guide.privacyText")}</p>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className={styles.note}>
            <div className={styles.noteRow}>
              <Keyboard size={20} />
              <div className={styles.grow}>
                <h2>{t("guide.shortcutsTitle")}</h2>
                <dl className={styles.shortcuts}>
                  {SHORTCUTS.map(({ key, label }) => (
                    <div key={key}>
                      <dt>
                        <kbd>{key}</kbd>
                      </dt>
                      <dd>{t(label)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className={styles.noteRow}>
              <Smartphone size={20} />
              <div>
                <h2>{t("guide.devicesTitle")}</h2>
                <p>{t("guide.devicesText")}</p>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
