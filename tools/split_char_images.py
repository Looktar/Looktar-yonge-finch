# The character models are glTF JSON with the binary buffer and images inlined. iOS refuses both blob: and data:
# image/buffer URLs inside the claude.ai artifact sandbox, but loads plain files next to the page, so: write each
# embedded image to dist/chars/ and point the glTF image at that relative file. (The buffer is decoded in JS.)
import json, base64, os, sys
d = os.path.join(os.path.dirname(__file__), '..', 'dist')
os.makedirs(os.path.join(d, 'chars'), exist_ok=True)
for name in ['Soldier', 'Michelle']:
    p = os.path.join(d, name + '.json'); g = json.load(open(p))
    if not any('bufferView' in im for im in g.get('images', [])): print(name, 'already split'); continue
    uri = g['buffers'][0]['uri']; bin = base64.b64decode(uri[uri.index(',') + 1:])
    for i, im in enumerate(g['images']):
        if 'bufferView' not in im: continue
        bv = g['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
        ext = 'jpg' if im.get('mimeType') == 'image/jpeg' else 'png'
        fn = f'chars/{name.lower()}_{i}.{ext}'
        open(os.path.join(d, fn), 'wb').write(bin[o:o + bv['byteLength']])
        im['uri'] = fn; del im['bufferView']
    json.dump(g, open(p, 'w'), separators=(',', ':'))
    print(name, 'images ->', [im['uri'] for im in g['images']])
