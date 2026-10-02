import "@ant-design/v5-patch-for-react-19";
import { createRoot } from "react-dom/client";

import "./index.css";
import "./i18n";
import App from "./layout/App";

console.log(`%c Virtual Cam 3D v${import.meta.env.APP_VERSION} `, "background:#fb8020;color:#fff;padding:2px 6px;border-radius:3px");

createRoot(document.getElementById("root")!).render(<App />);
