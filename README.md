# trickydevelopment

hackedGPT — character chat UI powered by OpenAI Responses API.

## Setup

1. Install [Bun](https://bun.com):

```bash
curl -fsSL https://bun.sh/install | bash
```

2. Install dependencies:

```bash
bun install
```

3. Copy the env template and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

## Run

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Important:** Use `bun run dev` (not a plain static file server). The `/api/chat` endpoint runs on the Bun server and keeps your API key on the backend.

## OpenAI Responses API

This project uses the [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) (`POST /v1/responses`).

### Option A: Dashboard Prompt (recommended if you created a Prompt)

If you built your chat as a Prompt in the OpenAI dashboard, add its ID to `.env`:

```env
OPENAI_PROMPT_POTTER=pmpt_xxxxxxxx
OPENAI_PROMPT_RUPIN=pmpt_xxxxxxxx
OPENAI_PROMPT_TOM=pmpt_xxxxxxxx
```

Optional version pin:

```env
OPENAI_PROMPT_POTTER_VERSION=2
```

### Option B: Built-in character instructions

If no Prompt ID is set for a character, the server sends built-in instructions from `lib/characters.ts`.

### Conversation memory

Multi-turn context is handled with `previous_response_id`. Each character keeps its own response chain in the browser session.

## API

`POST /api/chat`

```json
{
  "character": "Potter",
  "message": "Hello",
  "previousResponseId": "resp_xxx"
}
```

Response:

```json
{
  "text": "Assistant reply",
  "responseId": "resp_xxx"
}
```
