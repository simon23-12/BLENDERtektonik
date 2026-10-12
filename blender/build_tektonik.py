"""
Plattentektonik — prozeduraler Blender-Aufbau (Globus im Schnitt + Blockbild) und Export.

Blockbild: 1 Einheit = 10 km; Relief (Meerestiefe, Gebirge) 5-fach überhöht, Schichtdicken unverzerrt.
Schematisches Profil nach dem Vorbild Ostpazifischer Rücken – Nazca-Platte – Peru-Chile-Graben – Anden.
Z = oben, −Y = vorne (Schnittfläche). Im offenen Blender ausführen: exec(open(PFAD).read())
Schreibt: blender/tektonik.blend, web/models/tektonik.glb, web/models/timeline.json

Die Bewegung des Ozeanbodens (Magnetstreifen) läuft im Web-Shader: Jeder Krusten-Vertex trägt in UV.x
seinen Abstand vom Rücken (Einheiten). Blender liefert Geometrie, Inseln (Keyframes), Globus-Drehung und Ereignisse.
"""
import bpy, bmesh, math, random, json, os, time
import numpy as np
from mathutils import Vector, Matrix, Quaternion, noise
from bpy_extras import anim_utils

ROOT = "/Users/sim/Documents/lmgMINIprojekte/BLENDERtektonik"
GLB_PATH = os.path.join(ROOT, "web/models/tektonik.glb")
TIMELINE_PATH = os.path.join(ROOT, "web/models/timeline.json")
BLEND_PATH = os.path.join(ROOT, "blender/tektonik.blend")

FPS = 30
DUR = 72.0
F_END = int(DUR * FPS)
KEY_STEP = 3
rng = random.Random(11)
t_build = time.time()

PH = [
    (0.0, 9.0, "schalen"), (9.0, 15.0, "lithosphaere"), (15.0, 24.0, "konvektion"), (24.0, 34.0, "spreizung"),
    (34.0, 43.0, "subduktion"), (43.0, 51.0, "vulkan"), (51.0, 57.0, "erdbeben"), (57.0, 65.0, "hotspot"),
    (65.0, 72.0, "transform"),
]
T_GEO0 = 15.0                 # block time starts here
MYR_SPAN = 6.0                # animation covers the last 6 Myr (vor 6 Mio. Jahren → heute)
V_HALF = 5.0                  # cm/a per plate (half spreading rate) = 50 km/Myr = 5 units/Myr
V_UNITS = V_HALF * (MYR_SPAN / (DUR - T_GEO0))   # units per animation second

# block layout (units = 10 km)
X0, X1 = -90.0, 90.0
Y0, Y1 = -20.0, 20.0
ZB = -40.0
XR = {"vorn": -25.0, "hinten": -13.0}          # ridge axis of the two segments (offset by a transform fault)
XT = 45.0                                       # trench axis
COAST = 54.0
VEX = 5.0                                       # vertical exaggeration of relief
CRUST = 0.8                                     # oceanic crust (7–8 km)
HOT_X, HOT_Y = -60.0, -15.0

# geomagnetic polarity timescale (simplified; ages in Myr where the polarity flips, normal at present)
GPTS = [0.78, 0.99, 1.07, 1.78, 1.95, 2.58, 3.04, 3.11, 3.22, 3.33, 3.58, 4.19, 4.29, 4.48, 4.63, 4.80, 4.89, 4.98, 5.23,
        5.89, 6.14, 6.27, 6.57, 6.72, 6.94, 7.09, 7.14, 7.21, 7.26, 7.43, 7.65, 8.07, 8.11, 8.25, 8.70, 9.03, 9.31, 9.43,
        9.59, 9.78, 9.88, 9.92, 10.95, 11.06, 11.53, 11.94, 12.09, 12.18, 12.40, 12.73, 12.83, 13.01, 13.30, 13.51, 13.70,
        14.08, 14.16, 14.24, 14.61, 14.80, 14.89, 15.03, 15.16, 15.97, 16.27, 16.54, 16.72, 17.24, 17.62, 17.73, 18.06]


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def make_mat(name, hexcol, rough=0.6, metal=0.0, emit=None, alpha=1.0, vcol=False):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*srgb(emit[0]), 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    if vcol:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    m.diffuse_color = (*srgb(hexcol), alpha)
    return m


def write_anim(obj, frames, loc=None, quat=None, scale=None):
    ad = obj.animation_data_create()
    act = bpy.data.actions.new(obj.name + "_Action")
    ad.action = act
    slot = act.slots.new(id_type="OBJECT", name=obj.name)
    ad.action_slot = slot
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)

    def put(path, arr):
        arr = np.asarray(arr, dtype=np.float32)
        for idx in range(arr.shape[1]):
            fc = cb.fcurves.new(path, index=idx)
            fc.keyframe_points.add(len(frames))
            co = np.empty(len(frames) * 2, dtype=np.float32)
            co[0::2] = frames
            co[1::2] = arr[:, idx]
            fc.keyframe_points.foreach_set("co", co)
            fc.keyframe_points.foreach_set("interpolation", np.ones(len(frames), dtype=np.int32))
            fc.update()

    if loc is not None:
        put("location", loc)
    if quat is not None:
        obj.rotation_mode = "QUATERNION"
        q = np.asarray(quat, dtype=np.float32)
        for i in range(1, len(q)):
            if np.dot(q[i], q[i - 1]) < 0:
                q[i] = -q[i]
        put("rotation_quaternion", q)
    if scale is not None:
        put("scale", scale)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.actions, bpy.data.cameras,
                 bpy.data.lights, bpy.data.images):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


reset()
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start = 0
scene.frame_end = F_END
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
try:
    scene.world.use_nodes = True
except Exception:
    pass
_bg = scene.world.node_tree.nodes.get("Background")
if _bg:
    _bg.inputs["Color"].default_value = (0.002, 0.004, 0.009, 1)
LINK = scene.collection


def new_obj(name, me, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, me)
    LINK.objects.link(o)
    if parent:
        o.parent = parent
    o.location = loc
    return o


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    LINK.objects.link(o)
    o.empty_display_size = 1.0
    if parent:
        o.parent = parent
    o.location = loc
    return o


def mesh_from(name, verts, faces, mat=None, uvs=None, cols=None, smooth_faces=False):
    """verts: list of 3-tuples; faces: list of index lists; uvs: per-vertex (u, v); cols: per-vertex rgb."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [list(f) for f in faces])
    me.update()
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        lv = np.zeros(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        U = np.asarray(uvs, dtype=np.float32)[lv]
        uvl.data.foreach_set("uv", U.ravel())
    if cols is not None:
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        C = np.ones((len(verts), 4), dtype=np.float32)
        C[:, :3] = np.asarray(cols, dtype=np.float32)
        ca.data.foreach_set("color", C.ravel())
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth_faces
    return me


# ---------------------------------------------------------------- materials
M = {
    "basalt": make_mat("Kruste_Ozean", "#3c3f46", 0.75),
    "lith": make_mat("Lithosphaere", "#5b4a3d", 0.85),
    "mantel": make_mat("Mantel_Block", "#c8642c", 0.9, vcol=True),
    "kont": make_mat("Kontinent_Kruste", "#b89c86", 0.85),
    "kont_lith": make_mat("Kontinent_Lith", "#6a5747", 0.85),
    "land": make_mat("Land", "#7c8a5a", 0.9, vcol=True),
    "wasser": make_mat("Wasser", "#1f6aa8", 0.08, alpha=0.42),
    "magma": make_mat("Magma_Glow", "#ff5a1f", 0.5, emit=("#ff6a1a", 6.0)),
    "plume": make_mat("Plume_Glow", "#ff7a2a", 0.6, emit=("#ff7a2a", 2.2)),
    "pfeil": make_mat("Pfeil_Konvektion_Glow", "#ffb36b", 0.5, emit=("#ff9b4a", 0.7)),
    "pfeil_platte": make_mat("Pfeil_Platte", "#dfe8f2", 0.5, emit=("#cfe3ff", 0.12)),
    "kern_i": make_mat("Kern_innen", "#ffe08a", 0.4, emit=("#ffcf5a", 0.8)),
    "kern_a": make_mat("Kern_aussen", "#ff9a3c", 0.5, emit=("#ff7a1f", 0.3)),
    "mantel_u": make_mat("Mantel_unten", "#c54a2a", 0.8),
    "mantel_o": make_mat("Mantel_oben", "#e07b3c", 0.8),
    "asth": make_mat("Asthenosphaere_Globus", "#f0a050", 0.8),
    "lith_g": make_mat("Lithosphaere_Globus", "#6b5646", 0.85),
    "kruste_g": make_mat("Kruste_Globus", "#9aa4ae", 0.85),
    "ozean_g": make_mat("Ozean_Globus", "#1d5f9e", 0.35),
    "netz": make_mat("Gradnetz_Glow", "#9cc8ff", 0.5, emit=("#7fb7ff", 0.35)),
}

# ================================================================= 1) GLOBE (cutaway)
G = Vector((-300.0, 0.0, 20.0))
R_E = 30.0
globe = empty("Globus", G)
spec = [  # (name, radius, material)
    ("Ozean_Globus", 1.0, M["ozean_g"]),
    ("Kruste_Globus", 1 - 7 / 6371, M["kruste_g"]),
    ("Lithosphaere_Globus", 1 - 100 / 6371, M["lith_g"]),
    ("Asthenosphaere_Globus", 1 - 250 / 6371, M["asth"]),
    ("Mantel_Globus", 1 - 660 / 6371, M["mantel_o"]),
    ("Mantel_unten_Globus", 1 - 1000 / 6371, M["mantel_u"]),
    ("Kern_aussen_Globus", 3480 / 6371, M["kern_a"]),
    ("Kern_innen_Globus", 1220 / 6371, M["kern_i"]),
]
for i, (nm, rf, mat) in enumerate(spec):
    r = rf * R_E
    eps = 0.03 * i                       # inner layers protrude a hair into the cut so their faces win
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=r)
    me = bpy.data.meshes.new(nm)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(nm, me, globe)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    cutter_me = bpy.data.meshes.new("cut")
    bmc = bmesh.new()
    bmesh.ops.create_cube(bmc, size=1.0)
    bmesh.ops.scale(bmc, vec=(R_E * 1.5, R_E * 1.5, R_E * 1.5), verts=bmc.verts)
    bmesh.ops.translate(bmc, vec=(R_E * 0.75 + eps, -R_E * 0.75 - eps, R_E * 0.75 + eps), verts=bmc.verts)
    bmc.to_mesh(cutter_me)
    bmc.free()
    cutter = new_obj("cutter", cutter_me, globe)
    mod = o.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(cutter_me)
    # flat shading for the new planar cut faces
    for p in o.data.polygons:
        n = p.normal
        if max(abs(n.x), abs(n.y), abs(n.z)) > 0.999 and (p.center - Vector((0, 0, 0))).length < r * 0.999:
            p.use_smooth = False

# graticule (Gradnetz) on the outer surface, skipping the cut octant
bm = bmesh.new()


def arc(points, rad=0.09):
    for a, b in zip(points[:-1], points[1:]):
        d = b - a
        L = d.length
        if L < 1e-6:
            continue
        r = bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=rad, radius2=rad, depth=L)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(bm, verts=r["verts"], vec=(a + b) / 2)


def in_cut(p):
    return p.x > 0 and p.y < 0 and p.z > 0


Rg = R_E * 1.003
for lat in range(-60, 61, 30):
    pts = []
    for k in range(0, 361, 4):
        lo = math.radians(k)
        la = math.radians(lat)
        p = Vector((math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))) * Rg
        if in_cut(p):
            if len(pts) > 1:
                arc(pts)
            pts = []
        else:
            pts.append(p)
    if len(pts) > 1:
        arc(pts)
for lon in range(0, 360, 30):
    pts = []
    for k in range(-88, 89, 4):
        lo = math.radians(lon)
        la = math.radians(k)
        p = Vector((math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))) * Rg
        if in_cut(p):
            if len(pts) > 1:
                arc(pts)
            pts = []
        else:
            pts.append(p)
    if len(pts) > 1:
        arc(pts)
me = bpy.data.meshes.new("Gradnetz_Glow")
bm.to_mesh(me)
bm.free()
me.materials.append(M["netz"])
new_obj("Gradnetz_Glow", me, globe)

# ================================================================= 2) BLOCK
def floor_z(x, xr):
    """Sea floor (relief exaggerated): depth grows with sqrt(age); slight axial high at the ridge; trench."""
    d = abs(x - xr)
    age = d / V_HALF                              # Myr
    depth_km = 2.6 + 0.35 * math.sqrt(age)
    depth_km -= 0.35 * math.exp(-(d / 1.2) ** 2)  # axial high (fast-spreading ridge)
    if x > xr:
        k = smooth((x - (XT - 9.0)) / 9.0)
        depth_km += k * (7.6 - depth_km)          # down into the trench
    return -depth_km / 10 * VEX


def lith_thick(age):
    return min(9.0, 1.4 + 2.4 * math.sqrt(max(age, 0.0)))


# slab top beyond the trench (x, z)
SLAB = [(XT, None), (49.0, -6.3), (54.0, -8.6), (60.0, -12.0), (67.0, -17.0), (75.0, -23.8), (83.0, -31.0), (91.0, -38.5)]


def path_points(xr, side):
    """Top surface polyline of one plate segment, from the ridge outwards, as (x, z)."""
    pts = []
    if side < 0:   # Pacific plate, to the left edge
        n = int((xr - X0) / 0.5)
        for i in range(n + 1):
            x = xr - (xr - X0) * i / n
            pts.append((x, floor_z(x, xr)))
    else:          # Nazca plate: ridge → trench → slab
        n = int((XT - xr) / 0.5)
        for i in range(n + 1):
            x = xr + (XT - xr) * i / n
            pts.append((x, floor_z(x, xr)))
        z_t = pts[-1][1]
        sl = [(XT, z_t)] + SLAB[1:]
        # resample the slab path finely (Catmull-like via linear interpolation of a smoothed polyline)
        P = [Vector((x, 0, z)) for x, z in sl]
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            m = max(2, int((b - a).length / 0.6))
            for k in range(1, m + 1):
                p = a.lerp(b, k / m)
                pts.append((p.x, p.z))
        # light smoothing of the kink at the trench
        for _ in range(6):
            pts = [pts[0]] + [((pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4) for i in range(1, len(pts) - 1)] + [pts[-1]]
    return pts


def ribbon(name, pts, y0, y1, off0, off1_fn, mat, seg_y=12, uv_from_s=True, bump=0.0, cols_fn=None):
    """A layer of a plate between two offsets along the surface normal (off0 at top, off1 below),
    extruded between y0 and y1. UV.x = arc length s from the ridge (units)."""
    P = [Vector((x, 0, z)) for x, z in pts]
    s = [0.0]
    for i in range(1, len(P)):
        s.append(s[-1] + (P[i] - P[i - 1]).length)
    N = []
    for i in range(len(P)):
        a = P[max(0, i - 1)]
        b = P[min(len(P) - 1, i + 1)]
        t = (b - a).normalized()
        n = Vector((-t.z, 0, t.x))
        if n.z < 0:
            n = -n
        N.append(n)
    ys = [y0 + (y1 - y0) * j / seg_y for j in range(seg_y + 1)]
    verts, uvs, faces, cols = [], [], [], []
    ni, nj = len(P), len(ys)

    def vid(layer, i, j):
        return layer * ni * nj + i * nj + j
    for layer in (0, 1):
        for i in range(ni):
            o = off0 if layer == 0 else off1_fn(s[i])
            for j in range(nj):
                bmp = bump * noise.noise(Vector((P[i].x * 0.35, ys[j] * 0.35, 3.1))) if layer == 0 else 0.0
                p = P[i] + N[i] * (o + bmp)
                verts.append((p.x, ys[j], p.z))
                uvs.append((s[i], 0.0))
                cols.append(cols_fn(p) if cols_fn else (1, 1, 1))
    for i in range(ni - 1):
        for j in range(nj - 1):
            faces.append([vid(0, i, j), vid(0, i + 1, j), vid(0, i + 1, j + 1), vid(0, i, j + 1)])        # top
            faces.append([vid(1, i, j), vid(1, i, j + 1), vid(1, i + 1, j + 1), vid(1, i + 1, j)])        # bottom
        faces.append([vid(0, i, 0), vid(1, i, 0), vid(1, i + 1, 0), vid(0, i + 1, 0)])                    # front (y0)
        faces.append([vid(0, i, nj - 1), vid(0, i + 1, nj - 1), vid(1, i + 1, nj - 1), vid(1, i, nj - 1)])  # back
    for i in (0, ni - 1):
        for j in range(nj - 1):
            f = [vid(0, i, j), vid(0, i, j + 1), vid(1, i, j + 1), vid(1, i, j)]
            faces.append(f if i == 0 else f[::-1])
    me = mesh_from(name, verts, faces, mat, uvs=uvs, cols=cols if cols_fn else None)
    me.validate()
    me.normals_split_custom_set(None) if False else None
    # recalc consistent outward normals
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me), s


plate_info = {}
for seg, (ya, yb) in (("vorn", (Y0, 0.0)), ("hinten", (0.0, Y1))):
    xr = XR[seg]
    for side, pname in ((-1, "Pazifik"), (1, "Nazca")):
        pts = path_points(xr, side)
        tag = f"{pname}_{seg}"

        def lith_off(s, side=side):
            age = s / V_HALF
            if side > 0 and s > (XT - XR[seg]):
                age = (XT - XR[seg]) / V_HALF
            return -lith_thick(age)
        crust, s = ribbon(f"Kruste_{tag}", pts, ya, yb, 0.0, lambda s: -CRUST, M["basalt"], bump=0.06)
        lith, _ = ribbon(f"Lith_{tag}", pts, ya, yb, -CRUST, lith_off, M["lith"])
        # the web shader needs the distance from the ridge (arc length s) for every vertex: ship the path
        plate_info[tag] = {"s_total": round(s[-1], 3), "xr": xr, "y": [ya, yb],
                           "path": [[round(x, 3), round(z, 3), round(sv, 3)] for (x, z), sv in zip(pts, s)]}

# continent: top heightfield (exaggerated) + crust and mantle-lithosphere prisms below
def cont_top(x, y):
    if x < COAST - 2:
        # continental slope down to the trench (inner trench wall)
        k = smooth((x - XT) / (COAST - 2 - XT))
        return -3.8 + k * 3.8 + 0.1
    base = 0.25
    andes = 2.6 * math.exp(-((x - 66.0) / 5.0) ** 2) + 1.7 * smooth((x - 66.0) / 6.0)
    peaks = max(0.0, noise.fractal(Vector((x * 0.22, y * 0.22, 2.3)), 0.55, 2.0, 4)) * 1.6 * math.exp(-((x - 66.0) / 6.0) ** 2)
    rough = 0.4 * noise.fractal(Vector((x * 0.12, y * 0.12, 0.7)), 0.6, 2.0, 4) * smooth((x - COAST) / 6)
    return base + andes + peaks + rough


def slab_top_at(x):
    if x <= XT:
        return 0.0
    pts = SLAB[1:]
    prev = (XT, -3.9)
    for p in pts:
        if x <= p[0]:
            k = (x - prev[0]) / (p[0] - prev[0])
            return prev[1] + k * (p[1] - prev[1])
        prev = p
    return pts[-1][1]


def moho(x):
    return -(3.2 + 3.8 * smooth((x - COAST) / 14.0))


def cont_lith_base(x):
    return -11.0


NX, NY = 220, 44
xs = [XT + 0.4 + (X1 - XT - 0.4) * i / NX for i in range(NX + 1)]
ys = [Y0 + (Y1 - Y0) * j / NY for j in range(NY + 1)]


def prism_grid(name, top_fn, bot_fn, mat, cols_fn=None):
    verts, faces, cols = [], [], []
    ni, nj = len(xs), len(ys)

    def vid(l, i, j):
        return l * ni * nj + i * nj + j
    for l in (0, 1):
        for i, x in enumerate(xs):
            for j, y in enumerate(ys):
                z = top_fn(x, y) if l == 0 else bot_fn(x, y)
                verts.append((x, y, z))
                cols.append(cols_fn(x, y, z) if cols_fn else (1, 1, 1))
    for i in range(ni - 1):
        for j in range(nj - 1):
            faces.append([vid(0, i, j), vid(0, i + 1, j), vid(0, i + 1, j + 1), vid(0, i, j + 1)])
            faces.append([vid(1, i, j), vid(1, i, j + 1), vid(1, i + 1, j + 1), vid(1, i + 1, j)])
        faces.append([vid(0, i, 0), vid(1, i, 0), vid(1, i + 1, 0), vid(0, i + 1, 0)])
        faces.append([vid(0, i, nj - 1), vid(0, i + 1, nj - 1), vid(1, i + 1, nj - 1), vid(1, i, nj - 1)])
    for i in (0, ni - 1):
        for j in range(nj - 1):
            f = [vid(0, i, j), vid(0, i, j + 1), vid(1, i, j + 1), vid(1, i, j)]
            faces.append(f if i == 0 else f[::-1])
    me = mesh_from(name, verts, faces, mat, cols=cols if cols_fn else None, smooth_faces=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me)


def land_col(x, y, z):
    """Continuous colour ramp: coastal lowland green → dry highland brown → rock → snow."""
    stops = [(-4.0, "#4e5a4a"), (0.1, "#5f7a45"), (1.2, "#7d8a52"), (2.2, "#8b7a62"), (3.0, "#77695c"), (3.5, "#e6eaee")]
    z += 0.25 * noise.noise(Vector((x * 0.3, y * 0.3, 5.0)))
    for (z0, c0), (z1, c1) in zip(stops[:-1], stops[1:]):
        if z <= z1:
            k = max(0.0, min(1.0, (z - z0) / (z1 - z0)))
            a, b = np.array(srgb(c0)), np.array(srgb(c1))
            return tuple(a * (1 - k) + b * k)
    return srgb(stops[-1][1])


land = prism_grid("Kontinent_Oberflaeche", lambda x, y: cont_top(x, y), lambda x, y: cont_top(x, y) - 0.25, M["land"], land_col)
prism_grid("Kontinent_Kruste", lambda x, y: cont_top(x, y) - 0.25,
           lambda x, y: max(moho(x), slab_top_at(x) + 0.35), M["kont"])
prism_grid("Kontinent_Lith", lambda x, y: max(moho(x), slab_top_at(x) + 0.35),
           lambda x, y: max(cont_lith_base(x), slab_top_at(x) + 0.3), M["kont_lith"])

# asthenosphere / mantle block (slightly inset so the plates' cut faces win)
def mantle_col(x, y, z):
    k = (z - ZB) / (-ZB)
    a, b = np.array(srgb("#5a170c")), np.array(srgb("#b4592a"))
    return tuple(a * (1 - k) + b * k)


bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(X1 - X0 - 0.2, Y1 - Y0 - 0.2, -ZB - 3.2), verts=bm.verts)      # top stays below every plate
bmesh.ops.translate(bm, vec=(0, 0, (ZB - 3.2) / 2), verts=bm.verts)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=24, use_grid_fill=True)
me = bpy.data.meshes.new("Mantel_Block")
bm.to_mesh(me)
bm.free()
mc = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
C = np.ones((len(me.vertices), 4), np.float32)
for i, v in enumerate(me.vertices):
    C[i, :3] = mantle_col(v.co.x, v.co.y, v.co.z)
mc.data.foreach_set("color", C.ravel())
me.materials.append(M["mantel"])
new_obj("Mantel_Block", me)

# sea water
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(COAST + 1.0 - X0, Y1 - Y0, 4.0), verts=bm.verts)
bmesh.ops.translate(bm, vec=((COAST + 1.0 + X0) / 2, 0, -2.0), verts=bm.verts)
me = bpy.data.meshes.new("Wasser")
bm.to_mesh(me)
bm.free()
me.materials.append(M["wasser"])
new_obj("Wasser", me)

# magma chamber under the ridges (thin glowing lenses) + dikes
for seg in ("vorn", "hinten"):
    xr = XR[seg]
    ya, yb = (Y0, 0.0) if seg == "vorn" else (0.0, Y1)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    bmesh.ops.scale(bm, vec=(1.6, (yb - ya) / 2 - 0.05, 0.55), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(xr, (ya + yb) / 2, floor_z(xr, xr) - 1.6), verts=bm.verts)
    me = bpy.data.meshes.new(f"Magma_Ruecken_{seg}")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M["magma"])
    new_obj(f"Magma_Ruecken_{seg}", me)

# active Andes volcano: cone with crater + magma chamber + conduit
VX, VY = 64.0, -12.0
vz0 = cont_top(VX, VY)
bm = bmesh.new()
segs = 40
rings = [(0.0, 0.0), (6.5, 0.05), (4.6, 1.3), (2.9, 2.8), (1.4, 4.1), (0.8, 4.6), (0.5, 4.3), (0.0, 3.9)]
vs_rings = []
for rr, hh in rings:
    ring = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        jitter = 1 + 0.06 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, hh)))
        ring.append(bm.verts.new((VX + rr * jitter * math.cos(a), VY + rr * jitter * math.sin(a), vz0 - 0.4 + hh)))
    vs_rings.append(ring)
for i in range(len(vs_rings) - 1):
    for k in range(segs):
        a, b = vs_rings[i][k], vs_rings[i][(k + 1) % segs]
        c, d = vs_rings[i + 1][(k + 1) % segs], vs_rings[i + 1][k]
        bm.faces.new((a, b, c, d))
me = bpy.data.meshes.new("Vulkan")
bm.to_mesh(me)
bm.free()
vcol = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
C = np.ones((len(me.vertices), 4), np.float32)
for i, v in enumerate(me.vertices):
    h = v.co.z - vz0
    C[i, :3] = srgb("#ecf0f4") if h > 3.3 else srgb("#6e6258") if h > 0.8 else srgb("#76805a")
vcol.data.foreach_set("color", C.ravel())
for p in me.polygons:
    p.use_smooth = True
me.materials.append(M["land"])
new_obj("Vulkan", me)
VTOP = Vector((VX, VY, vz0 - 0.4 + 4.3))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
bmesh.ops.scale(bm, vec=(3.0, 2.4, 1.0), verts=bm.verts)
bmesh.ops.translate(bm, vec=(VX, VY, -3.0), verts=bm.verts)
me = bpy.data.meshes.new("Magmakammer")
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
me.materials.append(M["magma"])
new_obj("Magmakammer", me)
bm = bmesh.new()
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.35, radius2=0.25, depth=VTOP.z + 3.0)
bmesh.ops.translate(bm, verts=r["verts"], vec=(VX, VY, (VTOP.z - 3.0) / 2))
me = bpy.data.meshes.new("Schlot")
bm.to_mesh(me)
bm.free()
me.materials.append(M["magma"])
new_obj("Schlot", me)
# melt rising from the slab into the chamber (a few glowing droplets as static geometry)
slab_melt = Vector((61.0, VY, slab_top_at(61.0) + 0.8))

# hotspot plume (clipped at the cut face so the cross-section shows it)
bm = bmesh.new()
prof = []
for k in range(40):
    z = ZB + 0.5 + (-9.0 - ZB) * k / 39
    r = 2.6 + 1.6 * smooth((z - (-14.0)) / 5.0)      # mushroom head under the lithosphere
    prof.append((z, r))
rings_v = []
for z, r in prof:
    ring = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        y = HOT_Y + r * math.sin(a)
        ring.append(bm.verts.new((HOT_X + r * math.cos(a), max(y, Y0 - 0.05), z)))
    rings_v.append(ring)
for i in range(len(rings_v) - 1):
    for k in range(32):
        bm.faces.new((rings_v[i][k], rings_v[i][(k + 1) % 32], rings_v[i + 1][(k + 1) % 32], rings_v[i + 1][k]))
bm.faces.new(rings_v[-1])
me = bpy.data.meshes.new("Plume_Glow")
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
me.materials.append(M["plume"])
new_obj("Plume_Glow", me)

# volcanic islands of the hotspot track (Blender keyframes: ride on the Pacific plate, age and sink)
def island_mesh(name, seed):
    bm = bmesh.new()
    segs = 28
    prof = [(0.0, 0.0), (6.0, 0.0), (4.6, 0.5), (3.0, 1.4), (1.6, 2.4), (0.6, 3.0), (0.0, 3.15)]
    rr = []
    for rad, h in prof:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            j = 1 + 0.12 * noise.noise(Vector((math.cos(a) * 1.5 + seed, math.sin(a) * 1.5, h * 0.7)))
            ring.append(bm.verts.new((rad * j * math.cos(a), rad * j * math.sin(a), h)))
        rr.append(ring)
    for i in range(len(rr) - 1):
        for k in range(segs):
            a, b = rr[i][k], rr[i][(k + 1) % segs]
            c, d = rr[i + 1][(k + 1) % segs], rr[i + 1][k]
            if i == len(rr) - 2:
                bm.faces.new((a, b, c)) if c is not d else None
                continue
            bm.faces.new((a, b, c, d))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    C = np.ones((len(me.vertices), 4), np.float32)
    for i, v in enumerate(me.vertices):
        C[i, :3] = srgb("#3a3a40") if v.co.z > 2.2 else srgb("#6c8a4a") if v.co.z > 1.0 else srgb("#4c4f52")
    col.data.foreach_set("color", C.ravel())
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M["land"])
    return me


ISL_DT = 14.0
islands = []
frames = np.arange(0, F_END + 1, KEY_STEP, dtype=np.float32)
ts = frames / FPS


def plate_shift(t):
    return V_UNITS * max(0.0, t - T_GEO0)


xr_v = XR["vorn"]
for k in range(-4, 5):
    tb = T_GEO0 + 2.0 + k * ISL_DT                       # birth time (animation seconds; negative = before)
    name = f"Insel_{k + 4:02d}"
    o = new_obj(name, island_mesh(name, k * 1.7))
    L, S = [], []
    for t in ts:
        t = float(t)
        age_s = (max(t, T_GEO0) - tb) if tb >= T_GEO0 else (max(t, T_GEO0) - T_GEO0) + (T_GEO0 - tb)
        x = HOT_X - V_UNITS * age_s
        floor_here = floor_z(x, xr_v)
        if age_s < 0:
            sc = 0.0
        else:
            grow = smooth(age_s / 3.5)
            myr = age_s * (MYR_SPAN / (DUR - T_GEO0))
            fade = 1.0 - 0.55 * smooth(myr / 3.0)
            sc = grow * fade
        if x < X0 + 4.5:
            sc *= smooth((x - X0 - 1.0) / 3.5)
        L.append((x, HOT_Y, floor_here - 0.2))
        S.append((max(sc, 0.0), max(sc, 0.0), max(sc, 0.0) * 1.0))
    write_anim(o, frames, loc=L, scale=S)
    islands.append({"name": name, "tb": tb})

# convection arrows on the cut face (two cells, glowing tubes with heads)
def tube_arrow(name, pts, rad=0.45, head=1.6):
    bm = bmesh.new()
    P = [Vector(p) for p in pts]
    for a, b in zip(P[:-2], P[1:-1]):
        d = b - a
        r = bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=rad, radius2=rad, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(bm, verts=r["verts"], vec=(a + b) / 2)
    a, b = P[-2], P[-1]
    d = (b - a).normalized()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=rad * 2.6, radius2=0.0, depth=head)
    q = Vector((0, 0, 1)).rotation_difference(d)
    bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=r["verts"], vec=a + d * head / 2)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M["pfeil"])
    return new_obj(name, me)


def cell_arrow(name, cx, cz, rx, rz, a0, a1, direction):
    pts = []
    n = 40
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n) * direction
        pts.append((cx + rx * math.cos(a), Y0 - 0.6, cz + rz * math.sin(a)))
    return tube_arrow(name, pts)


# cell B (under the Nazca plate): rises at the ridge, flows right, sinks at the trench → clockwise seen from the front
cell_arrow("Pfeil_Konvektion_B1", (XR["vorn"] + XT) / 2, -26.0, 27.0, 9.5, 160, 20, -1)
cell_arrow("Pfeil_Konvektion_B2", (XR["vorn"] + XT) / 2, -26.0, 27.0, 9.5, -20, -160, -1)
cell_arrow("Pfeil_Konvektion_A1", (X0 + XR["vorn"]) / 2, -26.0, 24.0, 9.5, 20, 160, 1)
cell_arrow("Pfeil_Konvektion_A2", (X0 + XR["vorn"]) / 2, -26.0, 24.0, 9.5, 200, 340, 1)

# plate-motion arrows floating above the surface
def flat_arrow(name, x0, x1, y, z, w=2.4):
    d = 1 if x1 > x0 else -1
    head = 4.0
    xh = x1 - d * head
    pts = [(x0, y - w / 2), (xh, y - w / 2), (xh, y - w * 1.1), (x1, y), (xh, y + w * 1.1), (xh, y + w / 2), (x0, y + w / 2)]
    bm = bmesh.new()
    top = [bm.verts.new((px, py, z)) for px, py in pts]
    bot = [bm.verts.new((px, py, z - 0.35)) for px, py in pts]
    bm.faces.new(top if d < 0 else top[::-1])
    bm.faces.new(bot[::-1] if d < 0 else bot)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((top[i], top[j], bot[j], bot[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M["pfeil_platte"])
    return new_obj(name, me)


flat_arrow("Pfeil_Platte_Pazifik", -36.0, -54.0, 8.0, 2.6)
flat_arrow("Pfeil_Platte_Nazca", -4.0, 24.0, 8.0, 2.6)
flat_arrow("Pfeil_Platte_Suedamerika", 88.0, 76.0, 8.0, 6.5)

# ---------------------------------------------------------------- globe rotation
globe_q = []
for t in ts:
    a = math.radians(-12 + 16.0 * math.sin(2 * math.pi * float(t) / 20.0))
    globe_q.append((Quaternion((0, 0, 1), a) @ Quaternion((1, 0, 0), math.radians(0)))[:])
write_anim(globe, frames, loc=[tuple(G)] * len(frames), quat=globe_q)

# ---------------------------------------------------------------- anchors
def anchor(name, loc, parent=None):
    return empty("ANCHOR_" + name, loc, parent)


# globe anchors in globe-local coordinates (rotate with the globe)
def gl(r_frac, ax=(1, -1, 1)):
    v = Vector(ax).normalized()
    return v * R_E * r_frac


anchor("Kern_innen", (R_E * 0.12, -R_E * 0.12, R_E * 0.06), globe)
anchor("Kern_aussen", (R_E * 0.36, -R_E * 0.05, R_E * 0.36), globe)
anchor("Mantel", (R_E * 0.72, -R_E * 0.05, R_E * 0.55), globe)
anchor("Kruste_Globus", tuple(Vector((0.25, -0.95, 0.2)).normalized() * R_E * 1.002), globe)
anchor("Lith_Globus", (R_E * 0.995, -0.05, R_E * 0.04), globe)
anchor("Asth_Globus", (R_E * 0.978, -0.05, R_E * 0.12), globe)
anchor("Globus_Mitte", (0, 0, 0), globe)

anchor("Ruecken", (XR["vorn"], -10.0, floor_z(XR["vorn"], XR["vorn"]) + 0.2))
anchor("Ruecken_Schnitt", (XR["vorn"], Y0, -2.0))
anchor("Transform", ((XR["vorn"] + XR["hinten"]) / 2, 0.0, floor_z(XR["vorn"], XR["vorn"]) + 0.1))
anchor("Graben", (XT, -8.0, -3.6))
anchor("Subduktion", (58.0, Y0, -10.0))
anchor("Benioff", (52.0, Y0, -6.8))
anchor("Vulkan", (VX, VY, VTOP.z + 0.3))
anchor("Magmakammer", (VX, Y0, -3.0))
anchor("Magma_Schmelze", (61.0, Y0, slab_top_at(61.0) + 1.2))
anchor("Hotspot", (HOT_X, Y0, -24.0))
anchor("Inselkette", (HOT_X - 8, HOT_Y, 0.5))
anchor("Konvektion", ((XR["vorn"] + XT) / 2, Y0 - 0.6, -16.5))
anchor("Konvektion_A", ((X0 + XR["vorn"]) / 2, Y0 - 0.6, -16.5))
anchor("Kruste_Ozean", (8.0, Y0, floor_z(8.0, XR["vorn"]) - 0.4))
anchor("Lith_Ozean", (8.0, Y0, -5.0))
anchor("Asthenosphaere", (20.0, Y0, -22.0))
anchor("Kontinent", (80.0, Y0, -3.0))
anchor("Anden", (70.0, 6.0, 4.6))
anchor("Wasser", (-40.0, Y0, -0.6))
anchor("Magnetstreifen", (6.0, -6.0, floor_z(6.0, XR["vorn"]) + 0.2))
anchor("Platte_Pazifik", (-52.0, 8.0, 3.2))
anchor("Platte_Nazca", (14.0, 8.0, 3.2))
anchor("Platte_Suedamerika", (82.0, 8.0, 7.0))
anchor("Block_Mitte", (5.0, 0.0, -8.0))

# ---------------------------------------------------------------- events (earthquakes, eruptions)
erng = random.Random(3)
quakes = []


def slab_point(depth_frac):
    # along the slab top: from the trench (shallow) down to ~ 60 km depth ... deeper ones rarer
    x = XT + 1.0 + depth_frac * 34.0
    return (x, slab_top_at(x) - 0.4)


t = 34.5
while t < DUR:
    f = erng.random() ** 1.6
    x, z = slab_point(f)
    quakes.append({"t": round(t, 2), "p": [round(x, 2), round(erng.uniform(Y0 + 0.5, Y1 - 0.5) if erng.random() < 0.6 else Y0 + 0.3, 2), round(z, 2)], "m": round(4.0 + 2.5 * erng.random() ** 3, 1), "k": "sub"})
    t += erng.uniform(0.35, 1.0)
for t in (25.5, 27.0, 28.8, 30.1, 31.9, 33.2):
    seg = erng.choice(["vorn", "hinten"])
    y = erng.uniform(Y0 + 1, -1) if seg == "vorn" else erng.uniform(1, Y1 - 1)
    quakes.append({"t": t, "p": [XR[seg], round(y, 2), -1.0], "m": 3.8, "k": "ridge"})
quakes.append({"t": 52.4, "p": [49.5, Y0 + 0.3, -5.2], "m": 8.6, "k": "big"})
for t in (65.8, 66.9, 67.6, 68.7, 69.5, 70.6, 71.3):
    quakes.append({"t": t, "p": [round(erng.uniform(XR["vorn"] + 0.5, XR["hinten"] - 0.5), 2), 0.0, -0.8], "m": round(erng.uniform(4.0, 6.2), 1), "k": "transform"})
quakes.sort(key=lambda q: q["t"])

timeline = {
    "fps": FPS, "duration": DUR, "tGeo0": T_GEO0, "myrSpan": MYR_SPAN,
    "phases": [{"from": a, "to": b, "key": k} for a, b, k in PH],
    "vHalf_cm_a": V_HALF, "unitsPerSec": V_UNITS, "km_per_unit": 10, "vex": VEX,
    "gpts": GPTS,
    "ridges": XR, "trench": XT, "coast": COAST, "y": [Y0, Y1], "zBottom": ZB,
    "globe": {"center": list(G), "radius": R_E},
    "hotspot": {"x": HOT_X, "y": HOT_Y, "islands": islands, "dt": ISL_DT},
    "volcano": {"top": list(VTOP), "chamber": [VX, VY, -3.0], "melt": list(slab_melt), "eruptions": [[43.6, 50.6], [60.5, 61.8]]},
    "convection": {"cells": [[X0 + 1, XR["vorn"]], [XR["vorn"], XT + 2]], "z": [ZB + 1, -12.5], "y": Y0 - 0.4},
    "quakes": quakes,
    "plates": plate_info,
}
with open(TIMELINE_PATH, "w") as fh:
    json.dump(timeline, fh, indent=1, ensure_ascii=False)

result = {"objects": len(bpy.data.objects), "quakes": len(quakes), "units_per_s": round(V_UNITS, 3)}
scene.frame_set(0)
if os.environ.get("TEK_NO_EXPORT") is None:
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=False,
                              export_animations=True, export_animation_mode="SCENE", export_force_sampling=True,
                              export_frame_range=True, export_frame_step=KEY_STEP, export_cameras=False,
                              export_lights=False, export_apply=True, export_yup=True, export_texcoords=True,
                              export_normals=True, export_materials="EXPORT", export_vertex_color="ACTIVE",
                              export_optimize_animation_size=True, export_meshopt_compression_enable=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, compress=True)
    result["glb_mb"] = round(os.path.getsize(GLB_PATH) / 1e6, 2)
result["build_s"] = round(time.time() - t_build, 1)
print(json.dumps(result))
