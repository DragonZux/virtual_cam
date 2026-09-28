/** Đọc tên vật thể bằng Web Speech API (giọng của hệ điều hành / trình duyệt). */

export const speechSupported = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window;

export const speechLang = (language: string): string => (language.startsWith("en") ? "en-US" : "vi-VN");

export const findVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  if (!speechSupported()) return undefined;
  const prefix = lang.slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(prefix));
};

export const speak = (text: string, lang: string): void => {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  // Chọn liên tục thì chỉ đọc tên mới nhất
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = findVoice(lang);
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
};
