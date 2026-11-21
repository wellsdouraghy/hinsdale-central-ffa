import{J as e,Mr as t,Nr as n,Nt as r,Rt as i,a,i as o,or as s,r as c,t as l,y as u}from"./util-omenGa3m.js";var d={pool:0,pond:1,fountain:2},f={pool:{depth:[1.2,3.6],rough:.05,ripple:1.25,absorb:[.5,.1,.04],scatter:[.01,.2,.34],floor:[.84,.92,.95]},fountain:{depth:[.45,.45],rough:.07,ripple:1.8,absorb:[.5,.12,.08],scatter:[.03,.18,.24],floor:[.62,.7,.72]},pond:{depth:[.4,2.2],rough:.09,ripple:.7,absorb:[1.5,.75,1.7],scatter:[.07,.1,.035],floor:[.2,.17,.1]}},p=`
varying vec3 vPool;
uniform float uWTime, uWRough, uWRipple, uWKind, uWLaneW, uWLaneAxis, uWDeepSign;
uniform vec2 uWDim, uWDepth, uWAxisU, uWAxisV;
uniform vec3 uWAbsorb, uWScatter, uWFloor;
vec3 gWaterN;
float waHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float waNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(waHash(i), waHash(i + vec2(1, 0)), f.x), mix(waHash(i + vec2(0, 1)), waHash(i + vec2(1, 1)), f.x), f.y); }
vec2 waWave(vec2 p, vec2 d, float f, float sp) { return d * (cos(dot(p, d) * f + uWTime * sp) * f); }
vec2 waSlope(vec2 p, float fade) {
  vec2 g = waWave(p, vec2(0.80, 0.60), 1.3, 1.1) * 0.011 + waWave(p, vec2(-0.55, 0.83), 2.3, 1.7) * 0.008
         + waWave(p, vec2(0.30, -0.95), 4.1, 2.4) * 0.0045 * fade + waWave(p, vec2(-0.92, -0.38), 7.3, 3.3) * 0.0024 * fade;
  return g * uWRipple;
}
float waCaustic(vec2 f) {
  vec2 k = f * 1.45; float t = uWTime * 0.7;
  k += vec2(sin(k.y * 1.3 + t), cos(k.x * 1.1 - t * 0.8)) * 0.55;
  k += vec2(sin(k.y * 2.1 - t * 1.3), cos(k.x * 1.9 + t)) * 0.3;
  float c = 0.5 + 0.5 * sin(k.x * 2.3) * sin(k.y * 2.1 + t * 0.6);
  return c * c * c;
}`,m=`
{
  vec3 wV = normalize(vWPos - cameraPosition);
  float wDist = length(vWPos - cameraPosition);
  float wFade = 1.0 - smoothstep(25.0, 110.0, wDist);
  vec2 wS = waSlope(vWPos.xz, wFade);
  gWaterN = normalize(vec3(-wS.x, 1.0, -wS.y));
  vec3 wR = refract(wV, gWaterN, 0.752);
  if (wR.y > -0.05) wR = normalize(vec3(wV.x, min(wV.y, -0.25), wV.z));
  vec3 wCol; float wPath;
  if (uWKind < 0.5 || uWKind > 1.5) {
    // tiled basin in local metres: vPool.x along the long axis (0..L), vPool.y across (0..W)
    float dl = clamp(vPool.x / max(uWDim.x, 0.01), 0.0, 1.0); if (uWDeepSign < 0.0) dl = 1.0 - dl;
    float depth = mix(uWDepth.x, uWDepth.y, smoothstep(0.3, 0.72, dl));
    float tHit = depth / max(-wR.y, 0.22);
    vec2 off = vec2(dot(wR.xz, uWAxisU), dot(wR.xz, uWAxisV)) * tHit;
    vec2 f = vPool.xy + off;
    vec2 fc = clamp(f, vec2(0.0), uWDim);
    float wall = step(0.001, length(f - fc));                  // the refracted ray left the basin: it hit a wall
    wPath = mix(tHit, tHit * 0.55, wall) * 1.7;
    vec3 tile = uWFloor;
    #ifdef WATER_FINE
    vec2 tg = abs(fract(fc / 0.6) - 0.5); float grout = 1.0 - smoothstep(0.46, 0.5, max(tg.x, tg.y));
    tile *= mix(1.0, 0.985 + 0.03 * waHash(floor(fc / 0.6)), wFade) * mix(1.0, grout * 0.06 + 0.94, wFade);
    #endif
    if (uWLaneW > 0.0) {
      // lane line down the middle of every lane, with a T at each end (dark tile), plus the wall targets
      float along = mix(fc.x, fc.y, uWLaneAxis), across = mix(fc.y, fc.x, uWLaneAxis), len = mix(uWDim.x, uWDim.y, uWLaneAxis);
      float lc = abs(fract(across / uWLaneW) - 0.5) * uWLaneW;
      float lineM = (1.0 - smoothstep(0.11, 0.15, lc)) * step(2.0, along) * step(along, len - 2.0);
      float tee = (1.0 - smoothstep(0.46, 0.5, lc)) * (step(2.0, along) * step(along, 2.28) + step(len - 2.28, along) * step(along, len - 2.0));
      tile = mix(tile, vec3(0.02, 0.05, 0.2), max(lineM, tee));
    }
    tile = mix(tile, uWFloor * vec3(0.8, 0.86, 0.9), wall);
    #ifdef WATER_CAUSTICS
    tile *= 0.86 + 0.5 * waCaustic(fc) * (1.0 - wall * 0.5) / (1.0 + depth * 0.22) * wFade + 0.14 * (1.0 - wFade);
    #endif
    wCol = tile;
  } else {
    // pond: mud and weed, soft shore
    float depth = mix(uWDepth.x, uWDepth.y, smoothstep(0.0, 1.0, vPool.z));
    float tHit = depth / max(-wR.y, 0.22);
    vec2 f = vWPos.xz + wR.xz * tHit;
    wPath = tHit * 1.7;
    wCol = uWFloor * (0.7 + 0.6 * waNoise(f * 0.9)) + vec3(0.02, 0.06, 0.01) * waNoise(f * 2.7 + 9.0);
  }
  vec3 wT = exp(-uWAbsorb * wPath);
  diffuseColor.rgb = wCol * wT + uWScatter * (1.0 - wT.g) * 1.5;
  #ifdef WATER_SOFT
  diffuseColor.a *= smoothstep(0.0, 0.55, vPool.z);
  #endif
}`;function h(e,r){let a=e.quality||`high`,o=new i({color:16777215,roughness:r.rough,metalness:0,envMapIntensity:1.5,transparent:!!r.soft,depthWrite:!r.soft,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),s={uWTime:r.time,uWRough:{value:r.rough},uWRipple:{value:r.ripple},uWKind:{value:d[r.kind]},uWLaneW:{value:r.laneW||0},uWLaneAxis:{value:r.laneAxis||0},uWDeepSign:{value:r.deepSign||1},uWDim:{value:new t(r.L||1,r.W||1)},uWDepth:{value:new t(r.depth[0],r.depth[1])},uWAxisU:{value:new t(r.axisU[0],r.axisU[1])},uWAxisV:{value:new t(r.axisV[0],r.axisV[1])},uWAbsorb:{value:new n(...r.absorb)},uWScatter:{value:new n(...r.scatter)},uWFloor:{value:new n(...r.floor)}},c=(a===`low`?``:`#define WATER_CAUSTICS
`)+(a===`high`?`#define WATER_FINE
`:``)+(r.soft?`#define WATER_SOFT
`:``),l=e=>{Object.assign(e.uniforms,s),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec3 aPool; varying vec3 vPool;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vPool = aPool;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
`+c+p).replace(`#include <map_fragment>`,`#include <map_fragment>
`+m).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = uWRough;`).replace(`#include <normal_fragment_maps>`,`normal = normalize((viewMatrix * vec4(gWaterN, 0.0)).xyz);`)};return l.key=`water:`+a+`:`+(r.soft?`s`:`h`),e.applyBakedShadow&&e.sky?.shadowUniforms?e.applyBakedShadow(o,e.sky.shadowUniforms,l):(o.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vWPos;`).replace(`#include <project_vertex>`,`#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vWPos;`),l(e)},o.customProgramCacheKey=()=>l.key),o}function g(){let e=a(8,64),t=e.getContext(`2d`);for(let e=0;e<8;e++)t.fillStyle=e%2?`#ffffff`:`#8a8a8a`,t.fillRect(0,e*8,8,8),t.fillStyle=`rgba(0,0,0,0.35)`,t.fillRect(0,e*8,8,1);return c(e,{aniso:4})}var _=null;function v(n,a={}){let c=d[a.kind]===void 0?`pool`:a.kind,p=f[c],m=a.level===void 0?.05:a.level,v=0,y=Array.isArray(a.depth)?a.depth:a.depth?[a.depth,a.depth]:p.depth,b,x=!1,S=1,C=1,w=[1,0],T=[0,1],E=[0,0];if(a.rect){let{cx:e,cz:t,w:n,d:r,angle:i=0}=a.rect,o=Math.cos(i),s=Math.sin(i),c=(n,r)=>[e+n*o-r*s,t+n*s+r*o];b=[c(-n/2,-r/2),c(n/2,-r/2),c(n/2,r/2),c(-n/2,r/2)],x=!0,n>=r?(S=n,C=r,w=[o,s],T=[-s,o],E=b[0]):(S=r,C=n,w=[-s,o],T=[-o,-s],E=b[1])}else{if(b=(a.outline||[]).map(e=>[e[0],e[1]]),b.length<3)return null;if(b.length===4){let e=e=>[b[(e+1)%4][0]-b[e][0],b[(e+1)%4][1]-b[e][1]],t=e(0),n=e(1),r=Math.hypot(...t),i=Math.hypot(...n);if(Math.abs(t[0]*n[0]+t[1]*n[1])<.05*r*i){x=!0;let t=r>=i?0:1,n=e(t),a=e(t+1);S=Math.hypot(...n),C=Math.hypot(...a),w=[n[0]/S,n[1]/S],T=[a[0]/C,a[1]/C],E=b[t]}}}n.terrain&&!a.absolute&&(v=n.terrain.footprint(b).mean,m+=v);let D=c!==`pond`;if(D&&!x&&(E=[-1e4,-1e4],S=C=2e4,w=[1,0],T=[0,1]),!_||_.ctx!==n){let e={value:0};_={ctx:n,t:e},n.updaters.push(t=>{e.value=(e.value+(t||0))%3600})}let O=[],k=[],A=(e,t,n)=>{O.push(e,m,t),D?k.push((e-E[0])*w[0]+(t-E[1])*w[1],(e-E[0])*T[0]+(t-E[1])*T[1],n):k.push(e,t,n)},j=o(b);if(x||D){let e=s.triangulateShape(j.map(e=>new t(e[0],e[1])),[]);for(let t of e)for(let e of[0,2,1])A(j[t[e]][0],j[t[e]][1],1)}else{let e=0,t=0;for(let n of j)e+=n[0],t+=n[1];e/=j.length,t/=j.length;let n=j.map(n=>{let r=Math.hypot(n[0]-e,n[1]-t)||1,i=Math.max(.35,1-Math.min(2.2,r*.3)/r);return[e+(n[0]-e)*i,t+(n[1]-t)*i]});for(let r=0;r<j.length;r++){let i=j[r],a=j[(r+1)%j.length],o=n[r],s=n[(r+1)%j.length];A(i[0],i[1],0),A(o[0],o[1],1),A(a[0],a[1],0),A(a[0],a[1],0),A(o[0],o[1],1),A(s[0],s[1],1),A(o[0],o[1],1),A(e,t,1),A(s[0],s[1],1)}}let M=new u;M.setAttribute(`position`,new e(O,3)),M.setAttribute(`aPool`,new e(k,3)),M.setAttribute(`normal`,new e(new Float32Array(O.length).map((e,t)=>+(t%3==1)),3));{let e=M.attributes.position,t=e.getX(1)-e.getX(0),n=e.getZ(1)-e.getZ(0),r=e.getX(2)-e.getX(0),i=e.getZ(2)-e.getZ(0);if(n*r-t*i<0){let t=[];for(let n=0;n<e.count;n+=3)t.push(n,n+2,n+1);M.setIndex(t)}}M.computeBoundingBox(),M.computeBoundingSphere();let N=x&&a.lanes?a.lanes===!0?{count:Math.max(2,Math.round(C/2.5)),along:`long`}:a.lanes:null,P=N&&N.along===`short`?1:0,F=N?(P?S:C)/N.count:0,I=h(n,{kind:c,time:_.t,rough:p.rough,ripple:(a.ripple||1)*p.ripple,depth:x||!D?y:[y[1],y[1]],L:S,W:C,axisU:w,axisV:T,laneW:F,laneAxis:P,deepSign:a.deepEnd===-1?-1:1,absorb:p.absorb,scatter:a.tint||p.scatter,floor:a.floor||p.floor,soft:c===`pond`}),L=new r(M,I);L.name=`water:`+c,L.receiveShadow=!0,L.castShadow=!1,L.matrixAutoUpdate=!1,L.renderOrder=1,n.scene.add(L);let R=n.B,z=a.coping===!1?null:{w:.5,h:.11,...a.coping||{}};if(z&&D){let e=m+z.h,t=a.copingMaterial||`limestone`;for(let n=0;n<j.length;n++){let r=j[n],i=j[(n+1)%j.length],a=Math.hypot(i[0]-r[0],i[1]-r[1]);if(a<.05)continue;let o=(i[0]-r[0])/a,s=(i[1]-r[1])/a,c=s,l=-o,u=(r[0]+i[0])/2+c*z.w/2,d=(r[1]+i[1])/2+l*z.w/2,f=Math.atan2(-s,o);R.v(t).box(u,(e+v-.3)/2,d,a+z.w*2,e-v+.3,z.w,f,1/3),R.v(`blackMetal`).box((r[0]+i[0])/2-c*.03,m+.012,(r[1]+i[1])/2-l*.03,a,.02,.07,f),R.v(`paint`,!0).setColor(.05,.16,.42).box((r[0]+i[0])/2+c*.004,m+(e-m)*.5,(r[1]+i[1])/2+l*.004,a,e-m-.02,.012,f)}R.v(`paint`,!0).setColor(1,1,1)}let B=(e,t)=>[E[0]+w[0]*e+T[0]*t,E[1]+w[1]*e+T[1]*t],V=null;if(N&&a.ropes!==!1){let e=new l(!0),t=m+.035,o=a.ropeColors||[[.75,.06,.05],[.05,.18,.7]];for(let n=1;n<N.count;n++){let r=o[n%o.length];e.setColor(r[0],r[1],r[2]);let i=P?B(n*F,.12):B(.12,n*F),a=P?B(n*F,C-.12):B(S-.12,n*F);e.tube([i[0],t,i[1]],[a[0],t,a[1]],.06,6,1/1.6)}V=new r(e.toGeometry(),new i({map:g(),vertexColors:!0,roughness:.55})),V.name=`water:ropes`,V.castShadow=!1,V.receiveShadow=!0,V.matrixAutoUpdate=!1,n.scene.add(V)}if(N&&a.flags!==!1){let e=P?C:S,t=P?S:C,n=R.v(`paint`,!0),r=R.v(`galv`);for(let i of[4.57,e-4.57]){let e=e=>P?B(e,i):B(i,e),o=e(-.9),s=e(t+.9),c=m+1.85;for(let e of[o,s])r.cyl(e[0],v,e[1],.035,.035,c+.1-v,6,1,!0);r.tube([o[0],c,o[1]],[s[0],c,s[1]],.012,4);let l=Math.floor(t/.45),u=a.flagColors||[[.72,.06,.05],[.92,.92,.9]];for(let r=0;r<l;r++){let i=e((r+.08)*t/l),a=e((r+.92)*t/l),o=e((r+.5)*t/l),s=u[r%u.length];n.setColor(s[0],s[1],s[2]),n.tri([i[0],c,i[1]],[a[0],c,a[1]],[o[0],c-.34,o[1]]),n.tri([a[0],c,a[1]],[i[0],c,i[1]],[o[0],c-.34,o[1]])}}n.setColor(1,1,1)}let H=a.ladders===void 0?c===`pool`&&x?4:0:a.ladders;if(H&&x){let e=R.v(`aluminum`),t=Math.ceil(H/2);for(let n=0;n<2;n++)for(let r=0;r<t&&n*t+r<H;r++){let i=t===1?S*.5:S*(.12+.76*r/(t-1)),a=n?C:0,o=n?1:-1;for(let t of[-.24,.24]){let n=B(i+t,a-o*.22),r=B(i+t,a+o*.5),s=m+.95;e.tube([n[0],m-.02,n[1]],[n[0],s,n[1]],.022,6).tube([n[0],s,n[1]],[r[0],s,r[1]],.022,6).tube([r[0],s,r[1]],[r[0],v+.02,r[1]],.022,6)}}}return{mesh:L,ropes:V,ring:j,level:m,kind:c,L:S,W:C,toWorld:B}}function y(e){return(e.campus?.water||[]).map(t=>v(e,t))}export{y as addCampusWater,v as addWater};