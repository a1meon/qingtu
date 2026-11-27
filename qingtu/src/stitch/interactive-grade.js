import {colorMatchParameters} from '../../engine/image-color.mjs';

// WebGL draws the full preview during basic adjustments and color matching. The saved,
// advanced, and fallback paths use the shared CPU raster in image-color.mjs.
const vertex=`#version 300 es
void main() {
  vec2 point=vec2((gl_VertexID&1)*4,(gl_VertexID&2)*2)-1.;
  gl_Position=vec4(point,0.,1.);
}`;

const common=`#version 300 es
precision highp float;
precision highp int;
out vec4 result;
uniform sampler2D source;
const vec3 weights=vec3(.2126,.7152,.0722);
`;

const tone=common+`
uniform vec4 lightControls,rangeControls,finishControls,balanceControls;
uniform vec4 matchGain,matchOffset;

float gamut(float light,vec3 delta) {
  float high=max(max(delta.r,delta.g),delta.b);
  float low=min(min(delta.r,delta.g),delta.b);
  return min(1.,min(high>0.?(1.-light)/high:1.,low<0.?-light/low:1.));
}
float shiftLight(float light,float shift) {
  float after=light+shift;
  if(shift>0. && after>.94){
    float knee=max(light,.94),room=1.-knee,excess=after-knee;
    return knee+room*excess/(max(.06,room)+excess);
  }
  if(shift<0. && after<.06){
    float knee=min(light,.06),excess=knee-after;
    return knee-knee*excess/(max(.06,knee)+excess);
  }
  return after;
}
void main() {
  vec4 src=texelFetch(source,ivec2(gl_FragCoord.xy),0);
  if(src.a==0.) { result=src;return; }
  float y=dot(src.rgb,weights);
  float d=1.-y,dd=d*d,yy=y*y;
  float light=clamp(.5+(y*lightControls.x-.5)*lightControls.y+
    .004*(rangeControls.x*y*dd+rangeControls.y*d*yy)+
    .0025*(rangeControls.z*yy*yy+rangeControls.w*dd*dd)+
    .008*lightControls.z*y*d+.009*lightControls.w*yy*d+.0021*finishControls.z*dd,0.,1.);
  float chroma=max(max(src.r,src.g),src.b)-min(min(src.r,src.g),src.b);
  float sat=(1.+finishControls.x*.01)*(1.+.009*finishControls.y*(1.-chroma))*(1.-.002*finishControls.z);
  float r=(src.r-y+balanceControls.x)*sat;
  float b=(src.b-y+balanceControls.y)*sat;
  vec3 delta=vec3(r,-(weights.r*r+weights.b*b)/weights.g,b);
  if(matchGain.w>0.){
    if(balanceControls.z>0.)delta*=gamut(light,delta);
    float amount=1.,protection=matchOffset.w;
    if(protection>=0. && light>protection-.09){
      float chroma=max(max(delta.r,delta.g),delta.b)-min(min(delta.r,delta.g),delta.b);
      amount-=smoothstep(protection-.09,protection,light)*(1.-smoothstep(.045,.11,chroma));
    }
    light=shiftLight(light,amount*((matchGain.x-1.)*light+matchOffset.x));
    delta.b+=amount*((matchGain.y-1.)*delta.b+matchOffset.y);
    delta.r+=amount*((matchGain.z-1.)*delta.r+matchOffset.z);
    delta.g=-(weights.r*delta.r+weights.b*delta.b)/weights.g;
  }
  result=vec4(floor(255.*(vec3(light)+gamut(light,delta)*delta)+.5)/255.,src.a);
}`;

const effects=common+`
uniform vec4 spatial,frame;
uniform ivec2 size;
uniform int radius;
float luma(ivec2 p,float backup) {
  vec4 c=texelFetch(source,clamp(p,ivec2(0),size-1),0);
  return c.a==0.?backup:roundEven(dot(c.rgb,weights)*255.);
}
float detail(ivec2 p,int r,float center) {
  return center-(luma(p+ivec2(-r,0),center)+luma(p+ivec2(r,0),center)+
    luma(p+ivec2(0,-r),center)+luma(p+ivec2(0,r),center))*.25;
}
float grain(vec2 p) {
  uvec2 q=uvec2(floor(p*2300.));
  uint h=q.x*374761393u+q.y*668265263u;
  h=(h^(h>>13))*1274126177u;
  return float(h^(h>>16))/4294967295.-.5;
}
void main() {
  ivec2 p=ivec2(gl_FragCoord.x,float(size.y)-gl_FragCoord.y);
  vec4 src=texelFetch(source,p,0);
  if(src.a==0.) { result=vec4(0.);return; }
  vec2 uv=frame.xy+(vec2(p)+.5)*frame.zw/vec2(size);
  float center=roundEven(dot(src.rgb,weights)*255.);
  float delta=0.;
  if(spatial.x!=0.)delta+=clamp(detail(p,1,center),-30.,30.)*spatial.x*.016;
  if(spatial.y!=0.)delta+=clamp(detail(p,radius,center),-36.,36.)*spatial.y*.013;
  if(spatial.z!=0.)delta+=grain(uv)*spatial.z*.25;
  float edge=smoothstep(.23,.71,distance(uv,vec2(.5)));
  float fade=spatial.w*.006*edge;
  vec3 rgb=src.rgb+delta/255.;
  vec3 color=clamp(rgb-fade*(fade<0.?1.-rgb:rgb),0.,1.);
  result=vec4(floor(color*255.+.5)/255.*src.a,src.a);
}`;

function program(gl,fragment){
  const shaders=[
    [gl.VERTEX_SHADER,vertex],
    [gl.FRAGMENT_SHADER,fragment],
  ].map(([type,code])=>{
    const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  });
  const pass=gl.createProgram();
  shaders.forEach(shader=>gl.attachShader(pass,shader));
  gl.linkProgram(pass);shaders.forEach(shader=>gl.deleteShader(shader));
  if(!gl.getProgramParameter(pass,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pass));
  return pass;
}

function texture(gl){
  const value=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,value);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  return value;
}

export function createInteractiveGrade(){
  const canvas=new OffscreenCanvas(1,1),gl=canvas.getContext('webgl2',{antialias:false,depth:false,stencil:false});
  if(!gl)throw new Error('WebGL 2 不可用');
  const basePass=program(gl,tone),effectsPass=program(gl,effects);
  const original=texture(gl),graded=texture(gl),target=gl.createFramebuffer();
  const uniform=(pass,name)=>gl.getUniformLocation(pass,name);
  const light=uniform(basePass,'lightControls'),range=uniform(basePass,'rangeControls');
  const finish=uniform(basePass,'finishControls'),balance=uniform(basePass,'balanceControls');
  const matchGain=uniform(basePass,'matchGain'),matchOffset=uniform(basePass,'matchOffset');
  const spatial=uniform(effectsPass,'spatial'),frame=uniform(effectsPass,'frame');
  const size=uniform(effectsPass,'size'),radius=uniform(effectsPass,'radius');
  gl.disable(gl.DITHER);
  let uploaded;
  return (pixels,{adjustments={},match}={},width,height,crop)=>{
    if(gl.isContextLost())throw new Error('WebGL context lost');
    const {
      exposure=0,contrast=0,temperature=0,tint=0,saturation=0,vibrance=0,
      shadows=0,highlights=0,whites=0,blacks=0,brightness=0,glow=0,fade=0,
      sharpen=0,clarity=0,grain=0,vignette=0,
    }=adjustments;
    if(!uploaded||canvas.width!==width||canvas.height!==height){
      canvas.width=width;canvas.height=height;
      gl.bindTexture(gl.TEXTURE_2D,graded);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,graded,0);
      gl.viewport(0,0,width,height);uploaded=null;
    }
    gl.bindTexture(gl.TEXTURE_2D,original);
    if(uploaded!==pixels){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      uploaded=pixels;
    }
    const adjusted=!!(exposure||contrast||temperature||tint||saturation||vibrance||shadows||highlights||whites||blacks||brightness||glow||fade);
    if(adjusted||match?.strength){
      gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.useProgram(basePass);
      gl.uniform4f(light,2**exposure,2**(contrast/100),brightness,glow);
      gl.uniform4f(range,shadows,highlights,whites,blacks);
      gl.uniform4f(finish,saturation,vibrance,fade,0);
      gl.uniform4f(balance,.0012*temperature+.0009*tint,-.0016*temperature+.0009*tint,Number(adjusted),0);
      const {gain,offset,strength,protectedWhite}=colorMatchParameters(match);
      gl.uniform4f(matchGain,...gain,strength);
      gl.uniform4f(matchOffset,...offset,protectedWhite??-1);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindTexture(gl.TEXTURE_2D,graded);
    }
    const {left=0,top=0,right=1,bottom=1}=crop||{};
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(effectsPass);
    gl.uniform4f(spatial,sharpen,clarity,grain,vignette);
    gl.uniform4f(frame,left,top,right-left,bottom-top);
    gl.uniform2i(size,width,height);
    gl.uniform1i(radius,Math.max(2,Math.min(16,Math.round(Math.min(width,height)*.005))));
    gl.drawArrays(gl.TRIANGLES,0,3);
    return canvas.transferToImageBitmap();
  };
}
