# Recolor the paper's Figure 1 still (how-it-works.webp) into the page's four
# colors: tiles A B C D (the paper's blue, yellow, green, red) take a game
# pad's colors by letter (A red, B yellow, C blue, D green, at the page's
# saturation); the paper's magenta (the dragged tile's marks) becomes the
# page's red; the dark red render arrows and "render" become ink.
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(float) / 255

def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255

def onwhite(h, a):
    return 1 - a * (1 - hexc(h))

mx, mn = im.max(2), im.min(2)
L = (mx + mn) / 2
d = mx - mn
S = np.where(d == 0, 0, d / (1 - np.abs(2 * L - 1) + 1e-9))
r, g, b = im[..., 0], im[..., 1], im[..., 2]
H = np.where(mx == r, ((g - b) / (d + 1e-9)) % 6, np.where(mx == g, (b - r) / (d + 1e-9) + 2, (r - g) / (d + 1e-9) + 4)) * 60

lum = lambda c: (c.max() + c.min()) / 2
INK = hexc("#1d1d1f")
PAGE_RED = "#dc3400"

# (source anchors, light to dark) → (target anchors)
FAMILIES = {
    "A": (["#cde7fc", "#7ab9ef", "#56a6e8"], ["#f8cfcc", "#e8605c", "#dc2626"]),
    "B": (["#f9e4b0", "#e2b54e", "#d49b2c"], ["#fde7a3", "#eeb820", "#cc9200"]),
    "C": (["#c4f0dc", "#5cc88a", "#3aae6a"], ["#cfe1fe", "#5d95f1", "#2f72e4"]),
    "D": (["#f3b7b9", "#d9666c", "#c94f56"], ["#c8f0d2", "#41bf68", "#1e9c4b"]),
    "magenta": (["#f8c0f8", "#c838d0"], [onwhite(PAGE_RED, 0.3), PAGE_RED]),
    "maroon": (["#800808"], ["#1d1d1f"]),
}

def chain(pix_L, srcs, dsts):
    """Map lightness along white → anchors (light to dark) → black onto the target chain."""
    sL = [1.0] + [lum(hexc(c) if isinstance(c, str) else c) for c in srcs] + [0.0]
    tC = [np.ones(3)] + [hexc(c) if isinstance(c, str) else c for c in dsts] + [np.zeros(3)]
    outc = np.zeros(pix_L.shape + (3,))
    for i in range(len(sL) - 1):
        hi, lo = sL[i], sL[i + 1]
        m = (pix_L <= hi) & (pix_L >= lo) if i < len(sL) - 2 else (pix_L <= hi)
        w = np.clip((hi - pix_L[m]) / max(hi - lo, 1e-6), 0, 1)[:, None]
        outc[m] = tC[i] * (1 - w) + tC[i + 1] * w
    return outc

chroma = (S > 0.18) & (L < 0.94) & (d > 0.04)
redhue = (H < 25) | (H > 335)
maroon = binary_dilation((L < 0.45) & (S > 0.4) & redhue, iterations=2) & redhue & chroma
masks = {
    "maroon": maroon,
    "magenta": chroma & (H >= 270) & (H < 335),
    "A": chroma & (H >= 185) & (H < 240),
    "B": chroma & (H >= 28) & (H < 70),
    "C": chroma & (H >= 120) & (H < 185),
    "D": chroma & redhue & ~maroon,
}
res = im.copy()
for k, m in masks.items():
    srcs, dsts = FAMILIES[k]
    res[m] = chain(L[m], srcs, dsts)
Image.fromarray((np.clip(res, 0, 1) * 255).round().astype(np.uint8)).save(out)
