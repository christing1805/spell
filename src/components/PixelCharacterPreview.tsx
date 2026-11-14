import { useEffect, useRef } from 'react';
import { CostumePalette } from '../types/game';
import { drawWizardSprite } from '../utils/pixelSprites';

interface PixelCharacterPreviewProps {
  palette: CostumePalette;
  width?: number;
  height?: number;
  scale?: number;
  castColor?: string;
  isCasting?: boolean;
  hasShield?: boolean;
}

export default function PixelCharacterPreview({
  palette,
  width = 160,
  height = 140,
  scale = 4,
  castColor,
  isCasting = false,
  hasShield = false,
}: PixelCharacterPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const render = () => {
      frame += 0.16;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);

      // Subtle floor stone platform
      const groundY = height - 24;
      ctx.fillStyle = '#1E2538';
      ctx.fillRect(0, groundY, width, 24);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, groundY, width, 3);

      // Ambient magic dust
      ctx.fillStyle = palette.wandGlow;
      const sparkX = (Math.sin(frame * 0.3) * 0.4 + 0.5) * (width - 20) + 10;
      const sparkY = groundY - 30 - Math.abs(Math.cos(frame * 0.2)) * 35;
      ctx.fillRect(Math.round(sparkX), Math.round(sparkY), 3, 3);

      const spriteW = 16 * scale;
      const spriteH = 20 * scale;
      const drawX = Math.round((width - spriteW) / 2) - 4;
      const drawY = groundY - spriteH;

      drawWizardSprite(ctx, drawX, drawY, scale, palette, {
        frame,
        isJumping: false,
        isSliding: false,
        isCasting,
        castColor,
        hasShield,
      });

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [palette, width, height, scale, castColor, isCasting, hasShield]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pixelated rounded-lg border border-white/10 bg-[#0B0E17]"
    />
  );
}
