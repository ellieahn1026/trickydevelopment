const ARCHIVE_TEXT = "";

const CHARACTERS = [
  {
    name: "Potter",
    color: "#ff399f",
    colorActive: "#ff0015",
    href: "./index.html",
  },
  {
    name: "Rupin",
    color: "#ff5e00",
    colorActive: "#e1ff00",
    href: "./rupin.html",
  },
  {
    name: "Tom",
    color: "#54fe54",
    colorActive: "#00ffe1",
    href: "./tom.html",
  },
];

function characterButtons(activeName) {
  return CHARACTERS.map(
    (c) => `
          <button
            type="button"
            class="character${c.name === activeName ? " is-active" : ""}"
            data-name="${c.name}"
            data-color="${c.color}"
            data-color-active="${c.colorActive}"
            data-href="${c.href}"
            aria-pressed="${c.name === activeName ? "true" : "false"}"
            aria-label="Open ${c.name} chat"
          >
            <span class="character__swatch" style="--swatch: ${c.color}; --swatch-active: ${c.colorActive}"></span>
            <span class="character__label">${c.name}</span>
          </button>`,
  ).join("");
}

function chatPage({
  activeName,
  title,
  headline,
  placeholder,
  sendLabel = "Send",
  sendClass = "",
}) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Datatype:wght@400;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./pretendard-kr.css" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body data-character="${activeName}">
    <div class="screen">
      <div class="stage">
        <svg class="composer-trail" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path class="composer-trail__path" />
        </svg>
        <p class="archive-text" aria-hidden="true">${ARCHIVE_TEXT}</p>

        <header class="brand">
          <a href="./index.html"><h1>hackedGPT</h1></a>
        </header>

        <nav class="characters" aria-label="Characters">
          ${characterButtons(activeName)}
        </nav>

        <div class="sideline" aria-hidden="true"></div>

        <main class="chat-panel">
          <div class="chat-panel__thread" id="chat-thread" aria-live="polite"></div>
          <div class="chat-panel__composer" id="chat-composer">
            <p class="prompt__headline" id="chat-headline" data-default-headline="${headline}">${headline}</p>
            <form class="prompt__form" id="chat-form">
              <div class="prompt__field">
                <input
                  type="text"
                  id="chat-input"
                  name="message"
                  placeholder="${placeholder}"
                  autocomplete="off"
                  aria-label="${placeholder}"
                />
                <button type="submit" class="prompt__send ${sendClass}">${sendLabel}</button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>

    <script type="module" src="./nav.js"></script>
    <script type="module" src="./runaway-input.js"></script>
    <script type="module" src="./chat.js"></script>
  </body>
</html>`;
}

export { chatPage };
