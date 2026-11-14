import { BossId, CostumePalette, ObstacleType } from '../types/game';

function rect(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  px: number,
  py: number,
  pw: number,
  ph: number,
  s: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(ox + px * s), Math.round(oy + py * s), Math.round(pw * s), Math.round(ph * s));
}

export function drawWizardSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  palette: CostumePalette,
  opts: {
    frame: number;
    isJumping: boolean;
    isSliding: boolean;
    isCasting: boolean;
    castColor?: string;
    hasShield?: boolean;
    hurtFlash?: boolean;
  }
) {
  const { frame, isJumping, isSliding, isCasting, castColor, hasShield, hurtFlash } = opts;

  ctx.save();
  if (hurtFlash && Math.floor(frame * 4) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }
  if (palette.cloakSparkle) {
    // Subtle shimmer for Invisibility Cloak
    ctx.globalAlpha = 0.85 + Math.sin(frame * 0.4) * 0.12;
  }

  const bob = isJumping ? -1 : isSliding ? 5 : Math.sin(frame * 0.45) > 0 ? 0 : 1;
  const legPhase = Math.floor(frame * 0.35) % 4;
  const ox = x;
  const oy = y + bob * s;

  if (isSliding) {
    // Low sliding wizard pose
    rect(ctx, ox, oy, 1, 7, 11, 5, s, palette.robeMain);
    rect(ctx, ox, oy, 0, 9, 4, 3, s, palette.robeShade);
    rect(ctx, ox, oy, 2, 7, 9, 1, s, palette.trim);
    // Scarf trailing
    rect(ctx, ox, oy, -3, 7, 4, 2, s, palette.scarfPrimary);
    rect(ctx, ox, oy, -2, 8, 2, 1, s, palette.scarfSecondary);
    // Head
    rect(ctx, ox, oy, 8, 2, 5, 5, s, palette.skin);
    rect(ctx, ox, oy, 8, 1, 5, 2, s, palette.hatOrHair);
    if (palette.hasGlasses) {
      rect(ctx, ox, oy, 10, 4, 2, 1, s, '#1E293B');
    }
    // Boots forward
    rect(ctx, ox, oy, 12, 9, 3, 2, s, '#111827');
    ctx.restore();
    return;
  }

  // Trailing cloak flutter behind
  const flutter = legPhase % 2 === 0 ? 0 : 1;
  rect(ctx, ox, oy, 0 - flutter, 10, 3, 7, s, palette.robeShade);
  rect(ctx, ox, oy, 1 - flutter, 15, 2, 2, s, palette.trim);

  // Scarf tails fluttering behind neck
  rect(ctx, ox, oy, 0 - flutter, 7, 4, 2, s, palette.scarfPrimary);
  rect(ctx, ox, oy, -1 - flutter, 8, 2, 1, s, palette.scarfSecondary);

  // Legs (animated run cycle)
  if (isJumping) {
    rect(ctx, ox, oy, 4, 17, 2, 3, s, '#111827');
    rect(ctx, ox, oy, 8, 16, 2, 3, s, '#111827');
  } else {
    const l1 = legPhase === 0 ? 0 : legPhase === 2 ? 2 : 1;
    const l2 = legPhase === 0 ? 2 : legPhase === 2 ? 0 : 1;
    rect(ctx, ox, oy, 4 + l1, 17, 2, 3, s, '#0F172A');
    rect(ctx, ox, oy, 7 - l2, 17, 2, 3, s, '#1E293B');
  }

  // Robe body
  rect(ctx, ox, oy, 3, 8, 8, 9, s, palette.robeMain);
  rect(ctx, ox, oy, 3, 9, 2, 8, s, palette.robeShade);
  rect(ctx, ox, oy, 6, 9, 1, 8, s, palette.trim);
  // Trim bottom
  rect(ctx, ox, oy, 3, 16, 8, 1, s, palette.trim);

  // Scarf collar
  rect(ctx, ox, oy, 4, 7, 6, 2, s, palette.scarfPrimary);
  rect(ctx, ox, oy, 6, 7, 2, 2, s, palette.scarfSecondary);

  // Head
  rect(ctx, ox, oy, 4, 2, 6, 5, s, palette.skin);
  // Eyes
  rect(ctx, ox, oy, 8, 4, 1, 1, s, '#0F172A');
  // Hair
  rect(ctx, ox, oy, 3, 1, 7, 2, s, palette.hatOrHair);
  rect(ctx, ox, oy, 3, 2, 1, 3, s, palette.hatOrHair);

  if (palette.hasWizardHat) {
    rect(ctx, ox, oy, 2, 1, 10, 1, s, palette.robeShade);
    rect(ctx, ox, oy, 4, -2, 6, 3, s, palette.robeMain);
    rect(ctx, ox, oy, 5, -4, 4, 2, s, palette.robeMain);
    rect(ctx, ox, oy, 6, -5, 2, 1, s, palette.trim);
    rect(ctx, ox, oy, 4, 0, 6, 1, s, palette.trim);
  } else if (palette.hasGoggles) {
    rect(ctx, ox, oy, 4, 2, 6, 2, s, '#92400E');
    rect(ctx, ox, oy, 7, 2, 3, 2, s, '#38BDF8');
  } else if (palette.hasGlasses) {
    rect(ctx, ox, oy, 7, 3, 3, 2, s, '#1E293B');
    rect(ctx, ox, oy, 8, 4, 1, 1, s, '#BAE6FD');
    // Subtle lightning scar pixel
    rect(ctx, ox, oy, 8, 2, 1, 1, s, '#EF4444');
  }

  // Wand arm
  if (isCasting) {
    rect(ctx, ox, oy, 10, 8, 4, 2, s, palette.robeMain);
    rect(ctx, ox, oy, 14, 8, 5, 1, s, '#78350F'); // Wand
    const glow = castColor || palette.wandGlow;
    rect(ctx, ox, oy, 19, 7, 3, 3, s, glow);
    rect(ctx, ox, oy, 20, 8, 1, 1, s, '#FFFFFF');
  } else {
    rect(ctx, ox, oy, 9, 10, 3, 2, s, palette.robeMain);
    rect(ctx, ox, oy, 12, 9, 4, 1, s, '#78350F');
    rect(ctx, ox, oy, 16, 9, 1, 1, s, palette.wandGlow);
  }

  // Cloak sparkles
  if (palette.cloakSparkle) {
    const sp = Math.floor(frame * 0.3) % 3;
    rect(ctx, ox, oy, 2 + sp * 3, 9 + sp * 2, 1, 1, s, '#F8FAFC');
    rect(ctx, ox, oy, 9 - sp * 2, 13 - sp, 1, 1, s, '#BAE6FD');
  }

  // Protego shield bubble
  if (hasShield) {
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox + 7 * s, oy + 9 * s, 14 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.fill();
  }

  ctx.restore();
}

export function drawDeathEaterSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  variant: 'scout' | 'shielded' | 'flier',
  frame: number,
  frozen: boolean
) {
  ctx.save();
  const hover = variant === 'flier' ? Math.sin(frame * 0.25) * 3 : 0;
  const ox = x;
  const oy = y + hover;

  if (frozen) {
    ctx.globalAlpha = 0.85;
  }

  if (variant === 'flier') {
    // Broomstick under Death Eater
    rect(ctx, ox, oy, -3, 14, 18, 1, s, '#451A03');
    rect(ctx, ox, oy, 13, 13, 4, 3, s, '#78350F');
  }

  // Black tattered robe
  const robeCol = frozen ? '#475569' : '#0F172A';
  const shadeCol = frozen ? '#64748B' : '#020617';
  rect(ctx, ox, oy, 2, 7, 9, 11, s, robeCol);
  rect(ctx, ox, oy, 4, 8, 5, 9, s, shadeCol);
  // Hood
  rect(ctx, ox, oy, 3, 1, 7, 6, s, shadeCol);
  // Silver Death Eater skull mask
  rect(ctx, ox, oy, 3, 3, 5, 4, s, frozen ? '#CBD5E1' : '#E2E8F0');
  rect(ctx, ox, oy, 4, 4, 1, 1, s, '#0F172A'); // Eye socket
  rect(ctx, ox, oy, 6, 4, 1, 1, s, '#0F172A');
  rect(ctx, ox, oy, 4, 6, 3, 1, s, '#475569'); // Mask mouth

  // Wand pointing left toward player
  rect(ctx, ox, oy, -2, 9, 4, 1, s, '#334155');
  if (!frozen) {
    rect(ctx, ox, oy, -3, 8, 2, 2, s, variant === 'flier' ? '#A855F7' : '#22C55E');
  }

  if (variant === 'shielded' && !frozen) {
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ox - 2 * s, oy, 14 * s, 18 * s);
  }

  ctx.restore();
}

export function drawBossSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  bossId: BossId,
  frame: number,
  isAttacking: boolean,
  hurtFlash: boolean
) {
  ctx.save();
  if (hurtFlash && Math.floor(frame * 5) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }

  const floatY = Math.sin(frame * 0.16) * 4;
  const ox = x;
  const oy = y + floatY;

  if (bossId === 'lucius') {
    // Lucius Malfoy: long platinum hair, dark cloak, silver snake cane
    rect(ctx, ox, oy, 4, 9, 12, 16, s, '#0F172A');
    rect(ctx, ox, oy, 6, 10, 8, 14, s, '#1E293B');
    rect(ctx, ox, oy, 5, 2, 9, 7, s, '#FDE68A'); // Blonde hair
    rect(ctx, ox, oy, 4, 4, 2, 8, s, '#FEF08A'); // Long hair strands
    rect(ctx, ox, oy, 12, 4, 2, 8, s, '#FEF08A');
    rect(ctx, ox, oy, 6, 3, 6, 5, s, '#F5D0B5'); // Face
    rect(ctx, ox, oy, 7, 5, 1, 1, s, '#0F172A');
    // Silver snake cane wand
    rect(ctx, ox, oy, -3, 12, 7, 1, s, '#CBD5E1');
    rect(ctx, ox, oy, -4, 11, 2, 2, s, isAttacking ? '#A3E635' : '#94A3B8');
  } else if (bossId === 'bellatrix') {
    // Bellatrix: wild dark curls, corset robe, glowing purple magic
    rect(ctx, ox, oy, 4, 9, 12, 16, s, '#18181B');
    rect(ctx, ox, oy, 6, 10, 8, 6, s, '#3F3F46');
    rect(ctx, ox, oy, 3, 0, 13, 8, s, '#09090B'); // Wild hair
    rect(ctx, ox, oy, 2, 3, 3, 7, s, '#18181B');
    rect(ctx, ox, oy, 13, 3, 3, 7, s, '#18181B');
    rect(ctx, ox, oy, 6, 3, 6, 5, s, '#E7D1C1');
    rect(ctx, ox, oy, 7, 5, 1, 1, s, '#A855F7'); // Fierce eye
    rect(ctx, ox, oy, -3, 11, 7, 1, s, '#78350F');
    rect(ctx, ox, oy, -5, 10, 2, 3, s, isAttacking ? '#EC4899' : '#C084FC');
  } else if (bossId === 'dolohov') {
    // Dolohov: heavy battle robe, crimson trim, dark aura
    rect(ctx, ox, oy, 3, 8, 14, 17, s, '#1E1B4B');
    rect(ctx, ox, oy, 6, 9, 8, 15, s, '#312E81');
    rect(ctx, ox, oy, 8, 9, 4, 10, s, '#9F1239'); // Crimson sash
    rect(ctx, ox, oy, 4, 1, 10, 7, s, '#0F172A'); // Hood
    rect(ctx, ox, oy, 6, 3, 6, 4, s, '#E2C0A4');
    rect(ctx, ox, oy, 7, 4, 1, 1, s, '#FB7185');
    rect(ctx, ox, oy, -4, 11, 7, 1, s, '#451A03');
    rect(ctx, ox, oy, -6, 10, 3, 3, s, isAttacking ? '#F43F5E' : '#FB7185');
  } else {
    // Lord Voldemort + Nagini
    rect(ctx, ox, oy, 3, 8, 14, 18, s, '#020617');
    rect(ctx, ox, oy, 5, 9, 10, 16, s, '#0F172A');
    // Pale serpentine head
    rect(ctx, ox, oy, 6, 1, 7, 7, s, '#E2E8F0');
    rect(ctx, ox, oy, 7, 4, 2, 1, s, '#EF4444'); // Red eyes
    // Elder Wand
    rect(ctx, ox, oy, -5, 11, 8, 1, s, '#E7E5E4');
    rect(ctx, ox, oy, -7, 10, 3, 3, s, isAttacking ? '#22C55E' : '#86EFAC');
    // Nagini serpent coiling at base
    const slither = Math.floor(frame * 0.25) % 2;
    rect(ctx, ox, oy, 1 + slither, 23, 14, 3, s, '#15803D');
    rect(ctx, ox, oy, -1 + slither, 21, 3, 3, s, '#22C55E');
    rect(ctx, ox, oy, -1 + slither, 22, 1, 1, s, '#FACC15');
  }

  ctx.restore();
}

export function drawObstacleSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  type: ObstacleType,
  frame: number,
  liftedOffset = 0
) {
  ctx.save();
  const drawY = y - liftedOffset;

  if (type === 'devils_snare') {
    // Writhing dark green & thorny vines
    ctx.fillStyle = '#064E3B';
    ctx.fillRect(x, drawY, w, h);
    ctx.fillStyle = '#10B981';
    for (let i = 0; i < 4; i++) {
      const wave = Math.sin(frame * 0.18 + i) * 5;
      ctx.fillRect(x + 6 + i * 10 + wave, drawY + 6, 5, h - 10);
    }
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(x + 10, drawY + 12, 4, 4);
    ctx.fillRect(x + w - 16, drawY + 26, 4, 4);
  } else if (type === 'locked_gate') {
    // Ornate iron bars + glowing gold padlock
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, drawY, w, 6);
    ctx.fillRect(x, drawY + h - 6, w, 6);
    for (let bx = x + 4; bx < x + w; bx += 11) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(bx, drawY, 5, h);
    }
    // Padlock
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x + w / 2 - 9, drawY + h / 2 - 8, 18, 16);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(x + w / 2 - 2, drawY + h / 2 - 2, 4, 6);
  } else if (type === 'stone_pillar') {
    // Heavy carved Hogwarts stone block
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, drawY, w, h);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(x + 4, drawY + 4, w - 8, 10);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 6, drawY + 20, w - 12, h - 26);
    if (liftedOffset > 5) {
      // Purple levitation aura
      ctx.strokeStyle = '#A78BFA';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, drawY - 2, w + 4, h + 4);
    }
  } else if (type === 'fiendfyre') {
    // Roaring cursed fire wall
    const flicker = Math.floor(frame * 0.4) % 3;
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(x + 4, drawY + 10, w - 8, h - 10);
    ctx.fillStyle = '#F97316';
    ctx.fillRect(x + 8, drawY + 4 + flicker * 3, w - 16, h - 8);
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(x + 14, drawY + 18, w - 28, h - 22);
  } else if (type === 'dark_mist') {
    // Swirling Dementor mist
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(x, drawY, w, h);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    const drift = Math.sin(frame * 0.15) * 6;
    ctx.fillRect(x + 6 + drift, drawY + 12, w - 12, 12);
    ctx.fillRect(x + 10 - drift, drawY + 34, w - 20, 12);
    // Ghostly eyes
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(x + w / 2 - 8, drawY + 22, 4, 4);
    ctx.fillRect(x + w / 2 + 4, drawY + 22, 4, 4);
  } else if (type === 'crystal_wall') {
    // Jagged dark magic crystal barrier
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(x + 6, drawY + 8, w - 12, h - 8);
    ctx.fillStyle = '#60A5FA';
    ctx.fillRect(x + 12, drawY, w - 24, h);
    ctx.fillStyle = '#DBEAFE';
    ctx.fillRect(x + 16, drawY + 10, 5, h - 20);
  } else if (type === 'boggart_chest') {
    // Rattling Boggart chest
    const rattle = Math.sin(frame * 0.7) * 2;
    ctx.fillStyle = '#78350F';
    ctx.fillRect(x + rattle, drawY + 10, w, h - 10);
    ctx.fillStyle = '#EC4899';
    ctx.fillRect(x + 6 + rattle, drawY + 18, w - 12, 6);
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(x + w / 2 - 3 + rattle, drawY + 20, 6, 8);
  } else {
    // Low spike
    ctx.fillStyle = '#64748B';
    for (let sx = x; sx < x + w; sx += 12) {
      ctx.fillRect(sx + 4, drawY, 4, h);
      ctx.fillRect(sx + 2, drawY + 6, 8, h - 6);
    }
  }

  ctx.restore();
}

export function drawScrollPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  frame: number
) {
  const bob = Math.sin(frame * 0.16) * 4;
  const ox = x;
  const oy = y + bob;

  // Glow aura
  ctx.fillStyle = 'rgba(229, 184, 75, 0.25)';
  ctx.fillRect(ox - 2 * s, oy - 2 * s, 14 * s, 14 * s);

  // Parchment body
  rect(ctx, ox, oy, 1, 1, 8, 8, s, '#FEF3C7');
  rect(ctx, ox, oy, 0, 1, 10, 2, s, '#D97706'); // Top scroll rod
  rect(ctx, ox, oy, 0, 8, 10, 2, s, '#D97706'); // Bottom scroll rod
  // Rune lines
  rect(ctx, ox, oy, 3, 4, 4, 1, s, '#92400E');
  rect(ctx, ox, oy, 3, 6, 3, 1, s, '#92400E');
  // Red Hogwarts wax seal
  rect(ctx, ox, oy, 6, 5, 2, 2, s, '#DC2626');
}

export function drawGalleonPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  frame: number
) {
  const spin = Math.floor(frame * 0.2) % 4;
  const w = spin === 1 || spin === 3 ? 4 : spin === 2 ? 2 : 6;
  const offset = (6 - w) / 2;

  rect(ctx, x, y, offset, 0, w, 7, s, '#E5B84B');
  if (w >= 4) {
    rect(ctx, x, y, offset + 1, 1, w - 2, 5, s, '#FDE047');
  }
}

export function drawHealPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  frame: number
) {
  const bob = Math.sin(frame * 0.18) * 3;
  const ox = x;
  const oy = y + bob;
  rect(ctx, ox, oy, 1, 1, 7, 7, s, '#10B981');
  rect(ctx, ox, oy, 4, 2, 1, 5, s, '#FFFFFF');
  rect(ctx, ox, oy, 2, 4, 5, 1, s, '#FFFFFF');
}
