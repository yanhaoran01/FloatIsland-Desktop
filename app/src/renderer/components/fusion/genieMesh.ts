/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 FloatIsland contributors. GPL-3.0. */
/**
 * @file genieMesh.ts
 * @description 使用静态 WebGL 网格绘制窗口 Genie 变形过渡。
 * @author 鸡哥
 */
export type GenieEdge = 'top' | 'bottom' | 'left' | 'right';

/**
 * 计算快照在 Genie 过渡中的像素位置。
 * @param x - 网格横坐标，范围为 0 到 1。
 * @param y - 网格纵坐标，范围为 0 到 1。
 * @param p - 动画进度，范围为 0 到 1。
 * @param edge - 窗口收拢到的屏幕边缘。
 * @param width - 快照宽度（像素）。
 * @param height - 快照高度（像素）。
 * @param compact - 收拢状态下的小窗位置与尺寸（像素）。
 * @returns 变形后的位置坐标（像素）。
 */
export function geniePoint(
  x: number,
  y: number,
  p: number,
  edge: GenieEdge,
  width: number,
  height: number,
  compact: { x: number; y: number; width: number; height: number },
): [number, number] {
  p = Math.max(0, Math.min(1, p));
  const smooth = (value: number): number => {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  };
  const distance = edge === 'bottom' ? 1 - y : edge === 'top' ? y : edge === 'left' ? x : 1 - x;
  const travel = smooth(p);
  // A small bend follows the dock edge without stretching the page into a funnel.
  const bend = Math.sin(Math.PI * p);
  const squeeze = travel + 0.12 * bend * bend * (1 - distance);

  if (edge === 'top' || edge === 'bottom') {
    return [
      width / 2 + (compact.x + compact.width / 2 - width / 2) * travel + (x - 0.5) * (width * (1 - squeeze) + compact.width * squeeze),
      y * height * (1 - travel) + (compact.y + y * compact.height) * travel,
    ];
  }

  return [
    x * width * (1 - travel) + (compact.x + x * compact.width) * travel,
    height / 2 + (compact.y + compact.height / 2 - height / 2) * travel + (y - 0.5) * (height * (1 - squeeze) + compact.height * squeeze),
  ];
}

type GenieRenderer = {gl:WebGLRenderingContext;prepare:(image:HTMLCanvasElement,edge:GenieEdge,compact:{x:number;y:number;width:number;height:number},compactImage?:HTMLCanvasElement)=>(progress:number)=>void};
const renderers=new WeakMap<HTMLCanvasElement,GenieRenderer>();

/**
 * 创建只需更新进度 uniform 的 Genie 网格绘制器。
 * @param canvas - 显示变形快照的 WebGL 画布。
 * @param image - 窗口快照纹理。
 * @param edge - 窗口收拢到的屏幕边缘。
 * @param compact - 收拢状态下的小窗位置与尺寸（像素）。
 * @param compactImage - 可选的当前胶囊纹理，用于内容淡入淡出。
 * @returns 绘制给定进度画面的函数。
 */
export function createGenieMesh(
  canvas: HTMLCanvasElement,
  image: HTMLCanvasElement,
  edge: GenieEdge,
  compact: { x: number; y: number; width: number; height: number },
  compactImage?:HTMLCanvasElement,
): (progress: number) => void {
  const cached=renderers.get(canvas);
  if(cached&&!cached.gl.isContextLost())return cached.prepare(image,edge,compact,compactImage);
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    // Preserve the endpoint while asynchronous native-window handoff is in progress.
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  if (!gl) throw Error('gpu-unavailable');

  const vertexSource = `
    attribute vec2 pos;
    attribute vec2 uv;
    varying mediump vec2 tex;
    uniform mediump float progress;
    uniform float edge;
    uniform vec2 size;
    uniform vec4 compactRect;

    float smooth01(float value) {
      value = clamp(value, 0.0, 1.0);
      return value * value * (3.0 - 2.0 * value);
    }

    void main() {
      tex = uv;
      float distanceToEdge = edge > 2.5 ? 1.0 - pos.y : edge < 0.5 ? pos.y : edge < 1.5 ? pos.x : 1.0 - pos.x;
      float travel = smooth01(progress);
      float bend = sin(3.14159265 * progress);
      float squeeze = travel + 0.12 * bend * bend * (1.0 - distanceToEdge);
      vec2 pixel;

      if (edge < 0.5 || edge > 2.5) {
        pixel.x = size.x * 0.5 + (compactRect.x + compactRect.z * 0.5 - size.x * 0.5) * travel
          + (pos.x - 0.5) * (size.x * (1.0 - squeeze) + compactRect.z * squeeze);
        pixel.y = pos.y * size.y * (1.0 - travel)
          + (compactRect.y + pos.y * compactRect.w) * travel;
      } else {
        pixel.x = pos.x * size.x * (1.0 - travel)
          + (compactRect.x + pos.x * compactRect.z) * travel;
        pixel.y = size.y * 0.5 + (compactRect.y + compactRect.w * 0.5 - size.y * 0.5) * travel
          + (pos.y - 0.5) * (size.y * (1.0 - squeeze) + compactRect.w * squeeze);
      }

      gl_Position = vec4(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying mediump vec2 tex;
    uniform sampler2D image;
    uniform sampler2D capsule;
    uniform float hasCapsule;
    uniform mediump float progress;
    void main() {
      gl_FragColor = mix(texture2D(image,tex),texture2D(capsule,tex),hasCapsule*smoothstep(0.35,0.88,progress));
    }
  `;
  const compile = (kind: number, source: string): WebGLShader => {
    const shader = gl.createShader(kind);
    if (!shader) throw Error('gpu-unavailable');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw Error('shader-failed');
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw Error('gpu-unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('shader-failed');

  const position = gl.getAttribLocation(program, 'pos');
  const uv = gl.getAttribLocation(program, 'uv');
  const progressLocation = gl.getUniformLocation(program, 'progress');
  const edgeLocation = gl.getUniformLocation(program, 'edge');
  const sizeLocation = gl.getUniformLocation(program, 'size');
  const compactLocation = gl.getUniformLocation(program, 'compactRect');
  const imageLocation = gl.getUniformLocation(program, 'image');
  const capsuleLocation=gl.getUniformLocation(program,'capsule'),hasCapsuleLocation=gl.getUniformLocation(program,'hasCapsule');
  if (position < 0 || uv < 0 || !progressLocation || !edgeLocation || !sizeLocation || !compactLocation || !imageLocation) {
    throw Error('shader-failed');
  }

  const texture = gl.createTexture();
  const capsuleTexture=gl.createTexture();
  const buffer = gl.createBuffer();
  if (!texture || !capsuleTexture || !buffer) throw Error('gpu-unavailable');
  gl.useProgram(program);
  // Match the canvas compositor so translucent rounded edges stay clean.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.uniform1i(imageLocation, 0);
  gl.uniform1f(edgeLocation, edge === 'top' ? 0 : edge === 'left' ? 1 : edge === 'bottom' ? 3 : 2);
  gl.uniform2f(sizeLocation, image.width, image.height);
  gl.uniform4f(compactLocation, compact.x, compact.y, compact.width, compact.height);

  const uploadCapsule=(value?:HTMLCanvasElement):void=>{
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,capsuleTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,value||image);
    gl.uniform1i(capsuleLocation,1);gl.uniform1f(hasCapsuleLocation,value?1:0);gl.activeTexture(gl.TEXTURE0);
  };
  uploadCapsule(compactImage);
  // 网格拓扑与纹理坐标在整个过渡期间不变，只上传一次以减少主线程分配和总线传输。
  const segments = 32;
  const corners = [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1];
  const vertices = new Float32Array(segments * segments * 6 * 4);
  let offset = 0;
  for (let row = 0; row < segments; row++) {
    for (let column = 0; column < segments; column++) {
      for (let vertex = 0; vertex < 6; vertex++) {
        const x = (column + corners[vertex * 2]) / segments;
        const y = (row + corners[vertex * 2 + 1]) / segments;
        vertices[offset++] = x;
        vertices[offset++] = y;
        vertices[offset++] = x;
        vertices[offset++] = y;
      }
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);

  const draw = (progress: number): void => {
    gl.uniform1f(progressLocation, progress);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
  };
  renderers.set(canvas,{gl,prepare:(nextImage,nextEdge,nextCompact,nextCapsule)=>{
    gl.useProgram(program);uploadCapsule(nextCapsule);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,nextImage);
    gl.uniform1f(edgeLocation,nextEdge==='top'?0:nextEdge==='left'?1:nextEdge==='bottom'?3:2);
    gl.uniform2f(sizeLocation,nextImage.width,nextImage.height);
    gl.uniform4f(compactLocation,nextCompact.x,nextCompact.y,nextCompact.width,nextCompact.height);
    gl.viewport(0,0,canvas.width,canvas.height);
    return draw;
  }});
  return draw;
}
