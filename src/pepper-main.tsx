import { createRoot } from "react-dom/client";

import { Chat } from "./components/Chat.tsx";
import "../layout-engine.js";

const rootElement = document.getElementById("pepper-chat-root");

if (!rootElement) {
  throw new Error('Missing mount point "#pepper-chat-root".');
}

createRoot(rootElement).render(<Chat />);
