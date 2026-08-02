const canvas = document.getElementById("wave");
const ctx = canvas.getContext("2d");

const TEXT = "I am animating on a path";
const FONT = "700 28px Inconsolata, monospace";
const LETTER_SPACING = 2;

const WAVE = {
  amplitude: 36,
  frequency: 0.018,
  speed: 0.04,
  lineWidth: 2,
};

let phase = 0;
let dpr = 1;
let width = 0;
let height = 0;
let centerY = 0;

function waveY(x) {
  return centerY + WAVE.amplitude * Math.sin(x * WAVE.frequency + phase);
}

function waveTangent(x) {
  const dy = waveY(x + 1) - waveY(x - 1);
  return Math.atan2(dy, 2);
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  centerY = height * 0.5;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildPathSamples(step = 2) {
  const points = [];
  let arcLength = 0;

  for (let x = 0; x <= width; x += step) {
    const y = waveY(x);
    if (points.length > 0) {
      const prev = points[points.length - 1];
      arcLength += Math.hypot(x - prev.x, y - prev.y);
    }
    points.push({ x, y, arcLength, angle: waveTangent(x) });
  }

  return points;
}

function pointAtDistance(points, distance) {
  if (distance <= 0) return points[0];
  const last = points[points.length - 1];
  if (distance >= last.arcLength) return last;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].arcLength < distance) lo = mid + 1;
    else hi = mid;
  }

  const curr = points[lo];
  const prev = points[lo - 1];
  const span = curr.arcLength - prev.arcLength || 1;
  const t = (distance - prev.arcLength) / span;

  return {
    x: prev.x + (curr.x - prev.x) * t,
    y: prev.y + (curr.y - prev.y) * t,
    angle: prev.angle + (curr.angle - prev.angle) * t,
  };
}

function measureText(text) {
  ctx.font = FONT;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += ctx.measureText(text[i]).width + (i < text.length - 1 ? LETTER_SPACING : 0);
  }
  return total;
}

function drawWaveLine(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = "rgba(255, 127, 80, 0.35)";
  ctx.lineWidth = WAVE.lineWidth;
  ctx.stroke();
}

function drawText(points, textWidth) {
  const startDistance = Math.max(0, (points[points.length - 1].arcLength - textWidth) * 0.5);
  let cursor = startDistance;

  ctx.font = FONT;
  ctx.fillStyle = "coral";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (const char of TEXT) {
    const charWidth = ctx.measureText(char).width;
    const pos = pointAtDistance(points, cursor + charWidth * 0.5);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.angle);
    ctx.fillText(char, 0, 0);
    ctx.restore();

    cursor += charWidth + LETTER_SPACING;
  }
}

function draw() {
  phase += WAVE.speed;

  ctx.clearRect(0, 0, width, height);

  const points = buildPathSamples();
  drawWaveLine(points);
  drawText(points, measureText(TEXT));

  requestAnimationFrame(draw);
}

async function start() {
  resize();
  window.addEventListener("resize", resize);
  await document.fonts.load(FONT);
  requestAnimationFrame(draw);
}

start();
