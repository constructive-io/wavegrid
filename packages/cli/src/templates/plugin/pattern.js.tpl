({
  render(ctx) {
    const p = ctx.p;
    const hue = ((p.hue ?? 210) + (p.hueShift || 0) + 360) % 360;
    const saturation = Math.max(0, Math.min(100, (p.saturation ?? 85) + (p.satShift || 0)));
    for (let i = 0; i < ctx.count; i++) {
      ctx.set(i, hue, saturation, p.brightness ?? 70);
    }
  }
})
