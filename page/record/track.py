# Track the cursor through one of the page's original clips, frame by frame,
# by masked normalized cross-correlation against a few cursor templates (cut
# from the originals' own frames), at a few scales.
#
#   ORIG_FRAMES=<dir> python3 -I track.py <frames dir> <out.json> [scales...] [--templates file]
#
# ORIG_FRAMES holds each original's frames, one folder per clip (ffmpeg -i
# clips/<name>.mp4 <dir>/<name>/f%04d.png); templates.json, beside this, names
# each template's frame (under ORIG_FRAMES), crop box, and hotspot (or pass
# --templates for another file: a clip's own cursors, at their own scale).
import json, sys, os
import numpy as np
from PIL import Image
from scipy.signal import fftconvolve
from scipy.ndimage import binary_dilation, zoom as ndzoom

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.environ.get("ORIG_FRAMES", os.path.join(HERE, "orig-frames"))

def gray(fn):
    return np.asarray(Image.open(fn).convert("L")).astype(np.float32) / 255.0

def load_templates(scales, file):
    spec = json.load(open(file))
    out = []
    for t in spec:
        g = gray(os.path.join(ORIG, t["frame"]))
        x0, y0, x1, y1 = t["box"]
        crop = g[y0:y1, x0:x1]
        dark = crop < t.get("dark", 0.35)
        mask = binary_dilation(dark, iterations=t.get("ring", 2))
        if "fill" in t:
            # hands: white fill inside the outline counts too
            from scipy.ndimage import binary_fill_holes
            mask = binary_fill_holes(mask)
        hx, hy = t["hot"][0] - x0, t["hot"][1] - y0
        for s in scales:
            c = ndzoom(crop, s, order=1)
            m = ndzoom(mask.astype(np.float32), s, order=1) > 0.5
            out.append({"name": t["name"], "scale": s, "img": c, "mask": m, "hot": (hx * s, hy * s)})
    return out

def masked_ncc(img, tpl, mask):
    # NCC of tpl against every window of img, counting only mask pixels
    m = mask.astype(np.float32)
    n = m.sum()
    t = tpl * m
    tm = t.sum() / n
    tz = (tpl - tm) * m
    tnorm = np.sqrt((tz ** 2).sum())
    flip = lambda a: a[::-1, ::-1]
    s1 = fftconvolve(img, flip(m), mode="valid")
    s2 = fftconvolve(img * img, flip(m), mode="valid")
    num = fftconvolve(img, flip(tz), mode="valid")
    var = s2 - s1 * s1 / n
    r = num / (np.sqrt(np.maximum(var, 1e-6)) * tnorm + 1e-6)
    # flat windows (plain paper) have no cursor; FFT noise there is huge
    r[var < n * 0.004] = 0
    return r

def main():
    args = sys.argv[1:]
    tfile = os.path.join(HERE, "templates.json")
    if "--templates" in args:
        i = args.index("--templates")
        tfile = args[i + 1]
        del args[i : i + 2]
    frames_dir, out = args[0], args[1]
    scales = [float(s) for s in args[2:]] or [1.0]
    tpls = load_templates(scales, tfile)
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))
    track = []
    for f in files:
        g = gray(os.path.join(frames_dir, f))
        best = None
        for t in tpls:
            if t["img"].shape[0] >= g.shape[0]:
                continue
            r = masked_ncc(g, t["img"], t["mask"])
            i = np.unravel_index(np.argmax(r), r.shape)
            v = float(r[i])
            if best is None or v > best[0]:
                best = (v, t["name"], t["scale"], i[1] + t["hot"][0], i[0] + t["hot"][1])
        v, name, s, x, y = best
        track.append({"f": f, "score": round(v, 3), "kind": name, "scale": s, "x": round(float(x), 1), "y": round(float(y), 1)})
        print(f, track[-1]["score"], name, s, track[-1]["x"], track[-1]["y"], flush=True)
    json.dump(track, open(out, "w"), indent=0)

main()
