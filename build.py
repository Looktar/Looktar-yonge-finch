# Build: esbuild src/main.js -> dist/game.js, inlined into src/index.html at /*GAME*/ -> dist/index.html.
#   python3 build.py          build
#   python3 build.py --check  build into memory and fail if dist/index.html is out of date (CI, D-04)
# The page carries a build stamp (package version + git commit) shown on the menu, so a screenshot tells which
# build a player was running.
import json, subprocess, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
check = '--check' in sys.argv
r = subprocess.run(['npx', 'esbuild', 'src/main.js', '--bundle', '--minify', '--format=iife', '--target=es2020',
                    '--alias:postprocessing=./src/pp_stub.js', '--outfile=dist/game.js'], capture_output=True, text=True)
print(r.stdout[-2000:], r.stderr[-3000:])
if r.returncode: sys.exit(1)
ver = json.load(open('package.json'))['version']
js = open('dist/game.js').read().replace('</script', '<\\/script')
html = open('src/index.html').read().replace('/*GAME*/', js).replace('__BUILD__', 'v' + ver)
if check:
    cur = open('dist/index.html').read() if os.path.exists('dist/index.html') else ''
    if cur != html:
        print('dist/index.html is out of date: run `npm run build` and commit it'); sys.exit(1)
    print('dist/index.html is up to date'); sys.exit(0)
open('dist/index.html', 'w').write(html)
print('size', len(html))
