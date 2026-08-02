import { createRoot } from "react-dom/client";

import { Chat } from "./components/Chat.tsx";

const rootElement = document.getElementById("pepper-chat-root");

if (!rootElement) {
  throw new Error('Missing mount point "#pepper-chat-root".');
}

createRoot(rootElement).render(<Chat />);
