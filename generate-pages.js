import { chatPage } from "./chat-page.js";
import { writeFileSync } from "node:fs";

const DEFAULT_HEADLINE = "You want to talk with me? Follow.";

writeFileSync(
  "index.html",
  chatPage({
    activeName: "Potter",
    title: "PotterGPT — hackedGPT",
    headline: DEFAULT_HEADLINE,
    placeholder: "Ask to PotterGPT",
  }),
);

writeFileSync(
  "rupin.html",
  chatPage({
    activeName: "Rupin",
    title: "RupinGPT — hackedGPT",
    headline: DEFAULT_HEADLINE,
    placeholder: "Ask to RupinGPT",
  }),
);

writeFileSync(
  "tom.html",
  chatPage({
    activeName: "Tom",
    title: "TomGPT — hackedGPT",
    headline: DEFAULT_HEADLINE,
    placeholder: "Ask to TomGPT",
    sendLabel: "Block!",
    sendClass: "prompt__send--block",
  }),
);

console.log("Generated index.html, rupin.html, tom.html");
