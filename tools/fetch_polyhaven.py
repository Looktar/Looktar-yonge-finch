"""Download Poly Haven (CC0) models and pack each into one small .glb for the game.

python3 tools/fetch_polyhaven.py name [name ...] [--tex 512]
-> dist/models/<name>.glb  (textures downscaled to --tex px, JPEG q82; only the textures the default materials
use; KHR_materials_variants dropped). Needs network (api.polyhaven.com, dl.polyhaven.org).
"""
import io, json, os, struct, sys, urllib.request
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'models')
UA = {'User-Agent': 'yonge-finch-dev'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

def pack(name, tex):
    files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))['gltf']['1k']['gltf']
    base = files['url'].rsplit('/', 1)[0] + '/'
    g = json.loads(get(files['url']))
    inc = files.get('include', {})
    fetch = lambda rel: get(inc[rel]['url'] if rel in inc else base + rel)
    # textures actually used by the default materials
    used = set()
    for m in g.get('materials', []):
        m.get('extensions', {}).pop('KHR_materials_variants', None)
        def walk(o):
            if isinstance(o, dict):
                if 'index' in o and len(o) <= 3 and isinstance(o['index'], int): used.add(o['index'])
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for v in o: walk(v)
        walk(m)
    for me in g.get('meshes', []):
        for p in me['primitives']: p.get('extensions', {}).pop('KHR_materials_variants', None)
    g.get('extensions', {}).pop('KHR_materials_variants', None)
    if 'extensionsUsed' in g: g['extensionsUsed'] = [e for e in g['extensionsUsed'] if e != 'KHR_materials_variants']
    if 'extensionsRequired' in g: g['extensionsRequired'] = [e for e in g['extensionsRequired'] if e != 'KHR_materials_variants']
    # geometry buffer(s)
    blob = bytearray(); offs = []
    for b in g['buffers']:
        data = fetch(b['uri']); offs.append(len(blob)); blob += data
        while len(blob) % 4: blob += b'\0'
    for bv in g['bufferViews']:
        bv['byteOffset'] = bv.get('byteOffset', 0) + offs[bv['buffer']]; bv['buffer'] = 0
    # images: only the used ones, downscaled, embedded
    keep_img = sorted({g['textures'][t]['source'] for t in used})
    remap = {}
    for new_i, old_i in enumerate(keep_img):
        img = g['images'][old_i]; raw = fetch(img['uri'])
        im = Image.open(io.BytesIO(raw)); im = im.convert('RGB') if im.mode not in ('RGB', 'L') else im
        if max(im.size) > tex: im = im.resize((tex, tex * im.size[1] // im.size[0]), Image.LANCZOS)
        bio = io.BytesIO(); im.save(bio, 'JPEG', quality=82, optimize=True); data = bio.getvalue()
        g['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob += data
        while len(blob) % 4: blob += b'\0'
        remap[old_i] = {'bufferView': len(g['bufferViews']) - 1, 'mimeType': 'image/jpeg', 'name': img.get('name', '')}
    g['images'] = [remap[i] for i in keep_img]
    tmap = {}
    new_tex = []
    for t in sorted(used):
        tt = dict(g['textures'][t]); tt['source'] = keep_img.index(tt['source']); tmap[t] = len(new_tex); new_tex.append(tt)
    def fix(o):
        if isinstance(o, dict):
            if 'index' in o and len(o) <= 3 and isinstance(o['index'], int) and o['index'] in tmap: o['index'] = tmap[o['index']]
            for v in o.values(): fix(v)
        elif isinstance(o, list):
            for v in o: fix(v)
    for m in g.get('materials', []): fix(m)
    g['textures'] = new_tex
    g['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(g, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.glb'); open(path, 'wb').write(out)
    tris = sum(g['accessors'][p['indices']]['count'] // 3 for me in g['meshes'] for p in me['primitives'] if 'indices' in p)
    print(f'{name}: {len(out) / 1e6:.2f} MB, {tris} tris, {len(keep_img)} textures')

if __name__ == '__main__':
    args = sys.argv[1:]; tex = 512
    if '--tex' in args: i = args.index('--tex'); tex = int(args[i + 1]); del args[i:i + 2]
    for n in args: pack(n, tex)
