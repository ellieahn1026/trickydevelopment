const pathEl = document.querySelector(".composer-trail__path");
const points = [];
let lastX = null;
let lastY = null;

const MIN_DIST_PX = 10;

function pointsToSmoothPath(curvePoints) {
  if (curvePoints.length < 2) return "";

  if (curvePoints.length === 2) {
    const [a, b] = curvePoints;
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  let d = `M ${curvePoints[0].x} ${curvePoints[0].y}`;

  for (let i = 0; i < curvePoints.length - 1; i += 1) {
    const p0 = curvePoints[i - 1] ?? curvePoints[i];
    const p1 = curvePoints[i];
    const p2 = curvePoints[i + 1];
    const p3 = curvePoints[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function redrawTrail() {
  if (!pathEl) return;

  if (points.length < 2) {
    pathEl.setAttribute("d", "");
    return;
  }

  pathEl.setAttribute("d", pointsToSmoothPath(points));
}

function recordComposerCenter(composer) {
  if (!pathEl || !composer) return;
  if (document.body.dataset.character !== "Potter") return;

  const rect = composer.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  if (
    lastX != null &&
    lastY != null &&
    Math.hypot(x - lastX, y - lastY) < MIN_DIST_PX
  ) {
    return;
  }

  lastX = x;
  lastY = y;
  points.push({ x, y });
  redrawTrail();
}

export { recordComposerCenter };
