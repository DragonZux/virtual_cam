import { LivePage } from "@/page/Live";

/** A separate media workspace; mounting it releases the live webcam. */
export const TestPage = () => <LivePage visible testMode />;
