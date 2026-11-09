import * as THREE from 'three';

export function createMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      anchor:{value:new THREE.Vector3(1,0,0)}, east:{value:new THREE.Vector3(0,1,0)}, north:{value:new THREE.Vector3(0,0,1)},
      radius:{value:100}, width:{value:90}, height:{value:75}, angle:{value:0}, strength:{value:.65},
      minimum:{value:.7}, maximum:{value:2.7}, motif:{value:new THREE.Texture()}, motifSize:{value:new THREE.Vector2(1,1)},
      hasMotif:{value:false}, verified:{value:false}, original:{value:false}, mode:{value:1}, layered:{value:false},
      brightness:{value:1}, ledColor:{value:new THREE.Vector3(1,1,1)}, led:{value:new THREE.Vector3()}, attenuation:{value:.78}
    },
    vertexShader:`
      attribute float wall; attribute float shell;
      varying vec3 p; varying vec3 n; varying float thickness; varying float body;
      void main(){p=position;n=normal;thickness=wall;body=shell;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform vec3 anchor,east,north,ledColor,led;
      uniform float radius,width,height,angle,strength,minimum,maximum,brightness,attenuation;
      uniform sampler2D motif; uniform vec2 motifSize;
      uniform bool hasMotif,verified,original,layered; uniform int mode;
      varying vec3 p,n; varying float thickness,body;
      void main(){
        vec3 direction=normalize(p); float t=thickness;
        if(hasMotif && !verified && !original && layered && body>=.999){
          float longitude=atan(direction.y,direction.x);
          float latitude=asin(clamp(direction.z,-1.,1.));
          vec2 uv=vec2((longitude+3.141592653589793)/6.283185307179586,(latitude+1.570796326794897)/3.141592653589793);
          vec2 sampleValue=texture2D(motif,(uv*(motifSize-1.)+.5)/motifSize).rg;
          if(sampleValue.y>0.)t=clamp(t*(1.-sampleValue.y)+minimum*sampleValue.y+(maximum-minimum)*sampleValue.x,minimum,maximum);
        }
        if(hasMotif && !verified && !original && !layered && strength>0. && body>=.999){
          float cosine=clamp(dot(direction,anchor),-1.,1.);
          float theta=acos(cosine),sine=sin(theta);
          float stretch=radius*(sine>1e-8?theta/sine:1.);
          float x=dot(direction,east)*stretch,y=dot(direction,north)*stretch;
          float c=cos(angle),s=sin(angle);
          vec2 uv=vec2(.5+(c*x+s*y)/width,.5+(s*x-c*y)/height);
          if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.))) && cosine>-.999999){
            vec2 sampleUV=(uv*(motifSize-1.)+.5)/motifSize;
            vec2 sampleValue=texture2D(motif,sampleUV).rg;
            float edge=clamp(min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y))/.025,0.,1.);
            sampleValue*=edge*edge*(3.-2.*edge)*strength;
            if(sampleValue.y>0.) t=clamp(t*(1.-sampleValue.y)+minimum*sampleValue.y+(maximum-minimum)*sampleValue.x,minimum,maximum);
          }
        }
        vec3 normal=normalize(n);
        float reflected=max(dot(normal,normalize(vec3(.6,-.8,1.))),0.);
        vec3 rgb=vec3(.64,.69,.77)*(.09+.72*reflected);
        if(mode==1){
          vec3 ray=p-led; float distanceSquared=max(dot(ray,ray),radius*radius*.01);
          float incidence=clamp(abs(dot(normal,normalize(ray))),.12,1.);
          float transmission=exp(-attenuation*t/incidence);
          rgb=rgb*.12+ledColor*brightness*2.8*transmission*radius*radius/distanceSquared;
        }
        if(mode==2){
          float v=clamp((t-minimum)/max(maximum-minimum,.01),0.,1.);
          rgb=mix(vec3(.12,.65,.85),vec3(1.,.55,.16),v);
          if(t<minimum-.015 || t>maximum+.015)rgb=vec3(.95,.12,.3);
          rgb*=.4+.6*reflected;
        }
        gl_FragColor=vec4(rgb,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}
