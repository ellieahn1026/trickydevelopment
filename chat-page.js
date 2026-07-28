const BTN_SIZE = 97;

const CHARACTERS = [
  {
    name: "Potter",
    color: "#ff46ff",
    colorActive: "#ff46ff",
    colorHover: "#ed23ed",
    icon: "./assets/icons/potter.svg",
    iconSpeaking: "./assets/icons/potter-speaking.svg",
    href: "./index.html",
  },
  {
    name: "Rupin",
    color: "#2edbf0",
    colorActive: "#2edbf0",
    colorHover: "#00c7df",
    icon: "./assets/icons/rupin.svg",
    href: "./rupin.html",
  },
  {
    name: "Pepper",
    color: "#4CFF4F",
    colorActive: "#4CFF4F",
    colorHover: "#2DE731",
    icon: "./assets/icons/tom.svg",
    href: "./pepper.html",
    extraLink: {
      name: "F1",
      label: "F1",
      href: "./f1.html",
      color: "#ff670f",
      colorActive: "#ff670f",
      colorHover: "#ea5600",
      icon: "./assets/icons/tom.svg",
    },
  },
];

function characterButtons(activeName) {
  return CHARACTERS.map((c) => {
    const isActive = c.name === activeName;
    const extraActive = c.extraLink?.name === activeName;

    const button = `
          <button
            type="button"
            class="character${isActive ? " is-active" : ""}"
            data-name="${c.name}"
            data-color="${c.color}"
            data-color-active="${c.colorActive}"
            data-color-hover="${c.colorHover}"
            data-href="${c.href}"
            aria-pressed="${isActive ? "true" : "false"}"
            aria-label="Open ${c.name} chat"
          >
            <span class="character__swatch" style="--swatch: ${c.color}; --swatch-active: ${c.colorActive}; --swatch-hover: ${c.colorHover}">
              <img class="character__icon character__icon--default" src="${c.icon}" alt="" width="${BTN_SIZE}" height="${BTN_SIZE}" decoding="async" />
              ${
                c.iconSpeaking
                  ? `<img class="character__icon character__icon--speaking" src="${c.iconSpeaking}" alt="" width="${BTN_SIZE}" height="${BTN_SIZE}" decoding="async" aria-hidden="true" />`
                  : ""
              }
            </span>
            <span class="character__label">${c.name}</span>
          </button>`;

    if (!c.extraLink) {
      return button;
    }

    return `
          <div class="character-group">
            ${button}
            <a
              class="character character--f1${extraActive ? " is-active" : ""}"
              href="${c.extraLink.href}"
              aria-current="${extraActive ? "page" : "false"}"
              aria-label="Open F1 chat"
            >
              <span class="character__swatch" style="--swatch: ${c.extraLink.color}; --swatch-active: ${c.extraLink.colorActive}; --swatch-hover: ${c.extraLink.colorHover}">
                <img class="character__icon character__icon--default" src="${c.extraLink.icon}" alt="" width="${BTN_SIZE}" height="${BTN_SIZE}" decoding="async" />
              </span>
              <span class="character__label">${c.extraLink.label}</span>
            </a>
          </div>`;
  }).join("");
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
      href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;600;700&family=Xanh+Mono&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./orbit-kr.css" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body data-character="${activeName}">
    <div class="screen">
      <div class="stage">
        <svg class="composer-trail" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path class="composer-trail__path" />
        </svg>
        ${
          activeName === "F1"
            ? `<div class="f1-hourglass" aria-hidden="true"></div>`
            : ""
        }
        <header class="brand">
          <a href="./index.html"><h1>hackedGPT</h1></a>
        </header>

        <nav class="characters" aria-label="Characters">
          ${characterButtons(activeName)}
        </nav>

        <div class="user-badge-zone">
          <div class="user-badge__rule" aria-hidden="true"></div>
          <div class="user-badge" aria-label="User profile">
            <span class="user-badge__avatar" aria-hidden="true">
              <span class="user-badge__initial" id="user-initial">E</span>
            </span>
            <span class="user-badge__name" id="user-display-name">Ellie</span>
          </div>
        </div>

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
    <script type="module" src="./user-badge.js"></script>
    <script type="module" src="./runaway-input.js"></script>
    <script type="module" src="./chat.js"></script>
  </body>
</html>`;
}

export { chatPage };
