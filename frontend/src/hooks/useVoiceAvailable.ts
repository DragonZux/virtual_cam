import { useEffect, useState } from "react";

import { findVoice, speechSupported } from "@/utils/speech";

/** Máy có giọng đọc cho ngôn ngữ này không (danh sách giọng nạp bất đồng bộ → nghe `voiceschanged`) */
export const useVoiceAvailable = (lang: string): boolean => {
  const [available, setAvailable] = useState(() => !!findVoice(lang));
  useEffect(() => {
    if (!speechSupported()) return;
    const update = () => setAvailable(!!findVoice(lang));
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, [lang]);
  return available;
};
