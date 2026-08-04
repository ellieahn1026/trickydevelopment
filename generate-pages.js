import { chatPage, pepperPage } from "./chat-page.js";
import { writeFileSync } from "node:fs";

const DEFAULT_HEADLINE = "You want to talk with me? Follow.";

const potterPage = chatPage({
  activeName: "Potter",
  title: "PotterGPT — hackedGPT",
  headline: DEFAULT_HEADLINE,
  placeholder: "Ask to PotterGPT",
});

// Potter chat UI lives at index.html (Bun default entry) and potter.html
writeFileSync("index.html", potterPage);
writeFileSync("potter.html", potterPage);

writeFileSync(
  "rupin.html",
  chatPage({
    activeName: "Rupin",
    title: "RupinGPT — hackedGPT",
    headline: "I know everything. Just Ask and Believe.",
    placeholder: "Ask to RupinGPT",
  }),
);

writeFileSync("pepper.html", pepperPage());

writeFileSync(
  "f1.html",
  chatPage({
    activeName: "F1",
    title: "F1GPT — hackedGPT",
    headline: "I know everything. Just Ask and Believe.",
    placeholder: "Ask to F1GPT",
  }),
);

console.log("Generated index.html, potter.html, rupin.html, pepper.html, f1.html");
