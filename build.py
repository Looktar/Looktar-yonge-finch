import subprocess,sys
r=subprocess.run(['npx','esbuild','src/main.js','--bundle','--minify','--format=iife','--target=es2020','--alias:postprocessing=./src/pp_stub.js','--outfile=dist/game.js'],capture_output=True,text=True)
print(r.stdout[-2000:],r.stderr[-3000:])
if r.returncode: sys.exit(1)
js=open('dist/game.js').read().replace('</script','<\\/script')
html=open('src/index.html').read().replace('/*GAME*/',js)
open('dist/index.html','w').write(html)
print('size',len(html))
