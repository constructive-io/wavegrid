({
  render(ctx) {
    const p = ctx.p;
    let hue = p.hue;
    if (p.mode === 'Tint') {
      const rgb = [1, 3, 5].map(i => parseInt(p.tint.slice(i, i + 2), 16) / 255);
      const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min;
      hue = d === 0 ? 0 : max === rgb[0] ? ((rgb[1] - rgb[2]) / d + 6) % 6 * 60
        : max === rgb[1] ? ((rgb[2] - rgb[0]) / d + 2) * 60 : ((rgb[0] - rgb[1]) / d + 4) * 60;
    }
    if (Array.isArray(p.stops) && p.stops.length) hue = p.stops[0][0];
    hue = ((hue + (p.hueShift || 0)) % 360 + 360) % 360;
    for (let i = 0; i < ctx.count; i++) {
      const wave = p.enabled ? 0.5 + 0.5 * Math.sin(ctx.t * p.speed * 3 + i * 0.3) : 1;
      ctx.set(i, hue, Math.max(0, Math.min(100, 85 + (p.satShift || 0))), 20 + wave * 70);
    }
  }
})
