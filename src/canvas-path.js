export function roundRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.max(0, Math.min(Number(radius) || 0, Math.abs(width) / 2, Math.abs(height) / 2));
  const right = x + width;
  const bottom = y + height;
  context.moveTo(x + r, y);
  context.lineTo(right - r, y);
  context.quadraticCurveTo(right, y, right, y + r);
  context.lineTo(right, bottom - r);
  context.quadraticCurveTo(right, bottom, right - r, bottom);
  context.lineTo(x + r, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}
