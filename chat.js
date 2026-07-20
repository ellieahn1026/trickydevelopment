import { DEFAULT_HEADLINE } from "./headline-type.js";

const character = document.body.dataset.character || "Potter";
const thread = document.getElementById("chat-thread");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");

const replies = {
  Potter: [
    "Another person who's miserable because of their boss. Can't say I'm surprised. Humans build organizations, organizations create managers, and managers create meetings. It's an impressively efficient way to manufacture problems.",
    "Interesting. I'll keep it short — and slightly wrong on purpose.",
  ],
  Rupin: [
    "I don't want to talk now actually. Try again later.",
    "That question assumes I care. Bold.",
  ],
  Tom: [
    "Logged. Don't expect comfort. Expect a useful contradiction.",
    "Noted. The answer exists. Whether you like it is optional.",
  ],
};

const thinkingHeadlines = {
  Potter: "Thinking...",
  Rupin: "I don't want to talk now actually.",
  Tom: "Honestly, I'm not interested.",
};

let replyIndex = 0;

function scrollThreadToLatest() {
  requestAnimationFrame(() => {
    thread.scrollTop = thread.scrollHeight;
  });
}

function appendQuestion(text) {
  const el = document.createElement("div");
  el.className = "chat-question";
  el.textContent = text;
  thread.appendChild(el);
  scrollThreadToLatest();
  return el;
}

function appendAnswer(text) {
  const el = document.createElement("div");
  el.className = "chat-answer";
  el.textContent = text;
  thread.appendChild(el);
  scrollThreadToLatest();
  return el;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) {
    input.focus();
    return;
  }

  appendQuestion(message);
  input.value = "";
  headline.classList.remove("is-wave");
  headline.textContent = thinkingHeadlines[character] || "Thinking...";

  const pool = replies[character] || replies.Potter;
  const answer = pool[replyIndex % pool.length];
  replyIndex += 1;

  window.setTimeout(() => {
    appendAnswer(answer);
    headline.classList.remove("is-wave");
    headline.textContent =
      character === "Potter"
        ? DEFAULT_HEADLINE
        : thinkingHeadlines[character];
    scrollThreadToLatest();
  }, 450);
});
