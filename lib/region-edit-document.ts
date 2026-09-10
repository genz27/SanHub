import {
  canvasToFile,
  fetchImageAsFile,
  loadImage,
  type NormalizedRect,
} from '@/lib/image-canvas';

export type EditRegion = NormalizedRect & {
  id: string;
  shape: 'rect' | 'ellipse';
  note: string;
};

export type RegionEditDraft = {
  regions: EditRegion[];
  globalNote: string;
};

const REGION_COLORS = ['#38bdf8', '#f59e0b', '#c084fc', '#4ade80', '#fb7185'];
const DRAFT_STORAGE_KEY = 'sanhub.region-edit-drafts.v1';
const MAX_STORED_DRAFTS = 24;

export function createRegionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length];
}

export function regionInstruction(region: EditRegion, globalNote: string): string {
  return region.note.trim() || globalNote.trim() || '按整体说明修改此处';
}

export function regionTarget(region: EditRegion, globalNote: string): string {
  return regionInstruction(region, globalNote).replace(/^(改成|换成|改为)\s*/, '');
}

export function describeRegionPlace(region: EditRegion): string {
  const vertical = region.y < 0.34 ? '上部' : region.y + region.h > 0.66 ? '下部' : '中部';
  const horizontal = region.x < 0.34 ? '左侧' : region.x + region.w > 0.66 ? '右侧' : '中间';
  return `${vertical}${horizontal}`;
}

export type RegionEditIntent = 'replace-text' | 'edit-content';

const TEXT_REPLACE_MAX_CHARS = 12;
const VISUAL_EDIT_RE = /(让|穿|帮我|不要|怎么|COS|cosplay|衣服|服装|裙子|发型|脸|背景|姿势|改一下)/i;
const INSTRUCTION_PUNCT_RE = /[。！？!?，,；;：:\n]/;

export function isTextReplacement(text: string): boolean {
  const value = text.trim().replace(/^(改成|换成|改为)\s*/, '');
  if (!value) return false;
  if (value.length > TEXT_REPLACE_MAX_CHARS) return false;
  if (INSTRUCTION_PUNCT_RE.test(value)) return false;
  if (VISUAL_EDIT_RE.test(value)) return false;
  return true;
}

export function inferRegionEditIntent(regions: EditRegion[], globalNote: string): RegionEditIntent {
  if (regions.length === 0) return 'edit-content';
  const instructions = regions.map((region) => regionInstruction(region, globalNote));
  return instructions.every(isTextReplacement) ? 'replace-text' : 'edit-content';
}

function leftoverGlobalNote(regions: EditRegion[], globalNote: string): string {
  const overall = globalNote.trim();
  if (!overall) return '';
  if (regions.every((region) => !region.note.trim())) return '';
  const notes = regions.map((region) => region.note.trim()).filter(Boolean);
  if (notes.includes(overall)) return '';
  if (notes.length === 1 && (overall.includes(notes[0]) || notes[0].includes(overall))) return '';
  return overall;
}

const REGION_EDIT_TARGET_RE = /改成「([^」]+)」/g;
const REGION_EDIT_CONTENT_RE = /按说明改：([^\n]+)/g;

export function isRegionEditPrompt(prompt?: string | null): prompt is string {
  if (!prompt) return false;
  return (
    (prompt.includes('局部改字') && prompt.includes('改字稿')) ||
    prompt.includes('局部改图')
  );
}

function extractPromptParts(prompt: string, pattern: RegExp): string[] {
  const parts: string[] = [];
  const matcher = new RegExp(pattern.source, 'g');
  let match = matcher.exec(prompt);
  while (match) {
    const value = match[1]?.trim();
    if (value) parts.push(value);
    match = matcher.exec(prompt);
  }
  return parts;
}

function shortenTitle(text: string): string {
  return text.length <= 18 ? text : `${text.slice(0, 16)}…`;
}

export function regionEditDisplayTitle(prompt?: string | null): string | null {
  if (!isRegionEditPrompt(prompt)) return null;
  const targets = prompt.includes('局部改图')
    ? extractPromptParts(prompt, REGION_EDIT_CONTENT_RE)
    : extractPromptParts(prompt, REGION_EDIT_TARGET_RE);
  if (targets.length === 0) return '区域编辑';
  if (targets.length === 1) {
    return prompt.includes('局部改图') ? shortenTitle(targets[0]) : `改成${targets[0]}`;
  }
  const preview = targets.slice(0, 2).map((item) => item.slice(0, 8)).join('、');
  const suffix = targets.length > 2 ? '…' : '';
  return `${preview}${suffix} · ${targets.length} 处`;
}

export function displayPromptTitle(prompt?: string | null): string {
  return regionEditDisplayTitle(prompt) ?? (prompt?.trim() || '无提示词');
}

export function buildRegionPrompt(regions: EditRegion[], globalNote: string): string {
  const count = regions.length;
  const intent = inferRegionEditIntent(regions, globalNote);
  const supplement = leftoverGlobalNote(regions, globalNote);

  if (intent === 'replace-text') {
    const items = regions.map(
      (region, index) =>
        `${index + 1}. 把${describeRegionPlace(region)}第 ${index + 1} 处改成「${regionTarget(region, globalNote)}」`
    );
    return [
      '局部改字，不要重画整张图。',
      '第一张是改字稿，框内已经是目标新字；第二张是原图，用来对齐构图和书法。',
      ...items,
      count > 1 ? `以上 ${count} 处都要改掉，不能只改一处，也不能留旧字。` : '框内必须是新字，不能留旧字。',
      supplement ? `补充：${supplement}` : '',
      '未框选的部分与原图一致。新字用原图手写风格。不要留下框、编号、白底或清单。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const items = regions.map((region, index) => {
    const mark = region.shape === 'ellipse' ? '圈' : '框';
    return `${index + 1}. 把${describeRegionPlace(region)}${mark}出的区域按说明改：${regionTarget(region, globalNote)}`;
  });

  return [
    '局部改图，不要重画整张图，也不要在画面上写任何字或说明。',
    '第一张只标位置，彩色框里仍是原图，不是要抄的字。',
    '第二张是干净原图，用来对齐构图、光影和没框到的部分。',
    ...items,
    count > 1 ? `以上 ${count} 处都要改掉，不能只改一处。` : '框住的区域必须按说明改完。',
    supplement ? `补充：${supplement}` : '',
    '未框选部分与原图一致。不要留下框、编号、色块或提示文字。',
  ]
    .filter(Boolean)
    .join('\n');
}

function isEditRegion(value: unknown): value is EditRegion {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    (record.shape === 'rect' || record.shape === 'ellipse') &&
    typeof record.note === 'string' &&
    typeof record.x === 'number' &&
    typeof record.y === 'number' &&
    typeof record.w === 'number' &&
    typeof record.h === 'number'
  );
}

export function isRegionEditDraft(value: unknown): value is RegionEditDraft {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.globalNote === 'string' && Array.isArray(record.regions) && record.regions.every(isEditRegion);
}

export function cloneRegionEditDraft(draft: RegionEditDraft): RegionEditDraft {
  return {
    globalNote: draft.globalNote,
    regions: draft.regions.map((region) => ({ ...region })),
  };
}

export function hasRegionDraft(draft?: RegionEditDraft | null): boolean {
  return Boolean(draft && (draft.regions.length > 0 || draft.globalNote.trim()));
}

export function readStoredRegionDrafts(): Record<string, RegionEditDraft> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, RegionEditDraft] => isRegionEditDraft(entry[1]))
    );
  } catch {
    return {};
  }
}

export function writeStoredRegionDrafts(drafts: Record<string, RegionEditDraft>): void {
  if (typeof window === 'undefined') return;
  const entries = Object.entries(drafts)
    .filter((entry) => hasRegionDraft(entry[1]))
    .slice(-MAX_STORED_DRAFTS);
  window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function fitLabelSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number
): number {
  let size = Math.min(maxHeight * 0.62, maxWidth * 0.48, 96);
  while (size > 14) {
    ctx.font = `700 ${Math.round(size)}px "KaiTi", "STKaiti", "Songti SC", serif`;
    if (ctx.measureText(text).width <= maxWidth * 0.88) return size;
    size -= 2;
  }
  return 14;
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clipRegionPath(
  ctx: CanvasRenderingContext2D,
  region: EditRegion,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.beginPath();
  if (region.shape === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawReplacementInRegion(
  ctx: CanvasRenderingContext2D,
  region: EditRegion,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string
) {
  ctx.save();
  clipRegionPath(ctx, region, x, y, w, h);
  ctx.fillStyle = 'rgba(250, 248, 242, 0.94)';
  ctx.fill();

  const label = text.slice(0, 24);
  const fontSize = fitLabelSize(ctx, label, w, h);
  ctx.fillStyle = '#1c1917';
  ctx.font = `700 ${Math.round(fontSize)}px "KaiTi", "STKaiti", "Songti SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2, w * 0.9);
  ctx.restore();
}

function drawRegionHighlight(
  ctx: CanvasRenderingContext2D,
  region: EditRegion,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.save();
  clipRegionPath(ctx, region, x, y, w, h);
  ctx.fillStyle = hexAlpha(color, 0.28);
  ctx.fill();
  ctx.restore();
}

function drawAnnotationLegend(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regions: EditRegion[],
  globalNote: string
) {
  const pad = Math.max(16, Math.round(width * 0.018));
  const lineH = Math.max(22, Math.round(width * 0.022));
  const lines = [
    `必须全部改完：共 ${regions.length} 处`,
    ...regions.map((region, index) => `${index + 1}. ${regionTarget(region, globalNote)}`),
  ];

  ctx.save();
  ctx.font = `700 ${Math.round(lineH * 0.72)}px ui-sans-serif, system-ui, sans-serif`;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxW = Math.min(width - pad * 2, textWidth + pad * 1.6);
  const boxH = pad * 0.8 + lines.length * lineH;
  const regionsAreHigh = regions.every((region) => region.y < 0.55);
  const boxY = regionsAreHigh ? height - boxH - pad : pad;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(pad, boxY, boxW, boxH);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? '#f8fafc' : regionColor(index - 1);
    ctx.fillText(line, pad * 1.35, boxY + pad * 0.45 + index * lineH, boxW - pad);
  });
  ctx.restore();
}

export function paintRegionAnnotation(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  regions: EditRegion[],
  globalNote: string
) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (regions.length === 0) return;

  const stroke = Math.max(4, Math.round(width * 0.0045));
  const badgeSize = Math.max(28, Math.round(width * 0.028));
  const intent = inferRegionEditIntent(regions, globalNote);
  if (intent === 'replace-text' && regions.length > 1) {
    drawAnnotationLegend(ctx, width, height, regions, globalNote);
  }

  regions.forEach((region, index) => {
    const x = region.x * width;
    const y = region.y * height;
    const w = region.w * width;
    const h = region.h * height;
    const color = regionColor(index);
    const instruction = regionInstruction(region, globalNote);

    if (isTextReplacement(instruction)) {
      drawReplacementInRegion(ctx, region, x, y, w, h, instruction);
    } else {
      drawRegionHighlight(ctx, region, x, y, w, h, color);
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.setLineDash([stroke * 2.2, stroke * 1.4]);
    if (region.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }

    ctx.setLineDash([]);
    if (!(intent === 'edit-content' && regions.length === 1)) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 8 + badgeSize / 2, y + 8 + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(badgeSize * 0.55)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), x + 8 + badgeSize / 2, y + 8 + badgeSize / 2);
    }
    ctx.restore();
  });
}

export async function exportRegionEditImages(
  sourceUrl: string,
  regions: EditRegion[],
  globalNote: string
): Promise<{ original: File; annotated: File }> {
  const original = await fetchImageAsFile(sourceUrl, `original-${Date.now()}.png`);
  const objectUrl = URL.createObjectURL(original);
  let image: HTMLImageElement;
  try {
    image = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create annotation canvas');
  }

  paintRegionAnnotation(ctx, image, canvas.width, canvas.height, regions, globalNote);
  const annotated = await canvasToFile(
    canvas,
    `region-edit-${Date.now()}.jpg`,
    'image/jpeg',
    0.92
  );
  return { original, annotated };
}
