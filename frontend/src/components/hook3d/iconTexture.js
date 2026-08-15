// Renders each lucide icon (via its __iconNode SVG data) into a canvas along
// with the card chrome, producing a crisp CanvasTexture used on 3D card planes.
import * as THREE from 'three';

const ATTR_SNAKE = /[A-Z]/g;

function attrKey(k) {
  return k.replace(ATTR_SNAKE, (c) => '-' + c.toLowerCase());
}

function svgFor(node) {
  const [tag, attrs] = node;
  const parts = Object.entries(attrs)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${attrKey(k)}="${String(v)}"`)
    .join(' ');
  return `<${tag} ${parts}/>`;
}

async function iconSvgUrl(node) {
  const body = node.map(svgFor).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"` +
    ` fill="none" stroke="#67e8f9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function drawCard(ctx, W, H, iconUrl, label) {
  const r = 26;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(16,33,42,0.96)');
  g.addColorStop(1, 'rgba(7,16,22,0.96)');
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(W, 0, W, H, r);
  ctx.arcTo(W, H, 0, H, r);
  ctx.arcTo(0, H, 0, 0, r);
  ctx.arcTo(0, 0, W, 0, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(103,232,249,0.38)';
  ctx.lineWidth = 5;
  ctx.stroke();

  // soft inner glow behind the icon
  const glow = ctx.createRadialGradient(W / 2, H / 2.25, 8, W / 2, H / 2.25, W / 2);
  glow.addColorStop(0, 'rgba(34,211,238,0.16)');
  glow.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = H / 2.05;
      ctx.drawImage(img, (W - s) / 2, H / 2.75 - s / 2, s, s);
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(label, W / 2, H * 0.815);
      resolve();
    };
    img.onerror = reject;
    img.src = iconUrl;
  });
}

const cache = new Map();

// iconNode: lucide icon node arrays (`__iconNode` exports on dist/esm/icons/*.mjs)
export async function makeCardTexture(iconNode, label) {
  const key = label;
  if (cache.has(key)) return cache.get(key);
  const W = 256;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  await drawCard(canvas.getContext('2d'), W, H, await iconSvgUrl(iconNode), label);
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}