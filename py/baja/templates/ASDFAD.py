addNextAvailablePlates(plates) {
  if (!Array.isArray(plates) || plates.length === 0) return;

  // Previous (already-added) plate, if any
  const prevLast = this.root.length ? this.root[this.root.length - 1] : null;

  // Incoming leftmost plate (by xi)
  const leftMost = plates.reduce((min, pl) => (pl.grid.xi < min.grid.xi ? pl : min));

  // Append incoming plates
  this.root.push(...plates);

  // If we have a previous plate, make scales match WITHOUT changing min/max
  if (prevLast && prevLast.grid) {
    const targetXScale = prevLast.grid.xscale;
    const targetYScale = prevLast.grid.yscale;

    for (const pl of plates) {
      const g = pl.grid;

      // Keep g.xmin/xmax/ymin/ymax as-is.
      // Adjust *screen* width/height so that rescale() yields the same scale as prevLast.
      // width  = xscale * (xmax - xmin) + 2*xinset
      // height = yscale * (ymax - ymin) + 2*yinset
      const worldW = (g.xmax - g.xmin);
      const worldH = (g.ymax - g.ymin);

      // Preserve this plate's own insets
      const xinset = g.xinset ?? 0;
      const yinset = g.yinset ?? 0;

      g.width  = targetXScale * worldW + 2 * xinset;
      g.height = targetYScale * worldH + 2 * yinset;

      // Let grid recompute its internal transforms from width/height & world window
      if (typeof g.rescale === "function") g.rescale();

      // If your grid doesn't auto-derive shifts, ensure consistency:
      if ("xshift" in g) g.xshift = xinset - g.xmin * g.xscale;
      if ("yshift" in g) g.yshift = yinset - g.ymin * g.yscale;
    }
  }

  // World coordinates based on host grid (unchanged logic)
  const xwc = this.grid.Xwc(0);
  const ywc = this.grid.Ywc(0);
  const world_height = this.grid.worldHeight(this.grid.height);
  const world_width  = this.grid.worldWidth(this.grid.width);

  // Center X as before
  const newRootX = xwc + (world_width - leftMost.grid.width) / 2;

  // Y equals last plate's yi if present; otherwise use the prior arbitrary placement
  const newRootY = prevLast
    ? prevLast.grid.yi
    : (ywc - (world_height + leftMost.grid.height) / 2);

  // Offset relative to the incoming leftMost
  const offsetX = newRootX - leftMost.grid.xi;
  const offsetY = newRootY - leftMost.grid.yi;

  // Apply offset to all incoming plates
  for (const pl of plates) {
    pl.grid.xi += offsetX;
    pl.grid.yi += offsetY;
  }

  this.generateTables();
  this.selectedPlate = leftMost;
}
