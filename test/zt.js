import * as THREE from 'three';
import { loadZombieAssets, ZombieActor, zombiePose } from '../src/zombie.js';
const r = new THREE.WebGLRenderer({antialias:true}); r.setSize(1200,600); document.body.appendChild(r.domElement); r.toneMapping=THREE.ACESFilmicToneMapping;
const s = new THREE.Scene(); s.background=new THREE.Color(0x30343a); const cam=new THREE.PerspectiveCamera(40,2,0.1,100); cam.position.set(0,1.3,6.5); cam.lookAt(0,0.95,0);
s.add(new THREE.HemisphereLight(0xffffff,0x333333,2.2)); const d=new THREE.DirectionalLight(0xffffff,2.5); d.position.set(2,4,5); s.add(d);
const g=new THREE.Mesh(new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2), new THREE.MeshStandardMaterial({color:0x444444})); s.add(g);
const A = await loadZombieAssets();
const actors=[]; const types=[['soldier','walk',-2.4],['woman','walk',-0.8],['woman','run',0.8],['soldier','run',2.4]];
for(const [k,anim,x] of types){ const a=new ZombieActor(A,k); s.add(a.root); a.root.position.x=x; const z={yaw:0.35*(x<0?1:-1),type:anim==='run'?'run':'walk',phase:0,swing:0,lean:0.1,armOff:0.1,seed:Math.random()*9}; a.play(anim, anim==='run'?0.9:0.55); actors.push([a,z]); }
let t=0; window.step=(n)=>{for(let i=0;i<n;i++){t+=1/30; for(const [a,z] of actors){ a.root.rotation.y=z.yaw; a.mixer.update(1/30); z.phase+=1/30*4; zombiePose(a,z,t);} } r.render(s,cam); return 'ok'};
window.ready=true;
