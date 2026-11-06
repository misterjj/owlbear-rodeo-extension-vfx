// Scène du site : les vrais shaders de l'extension, joués dans un canvas WebGL 2.
import type { Uniform } from "@owlbear-rodeo/sdk";
import type { Animate } from "./fx-play";
import type { Point } from "./fx";

/**
 * Le SkSL de l'extension n'a que deux mots propres à Skia : `half4` et `float2`. Le reste est du
 * GLSL. `main(coord)` devient `effect(coord)`, appelé avec la position du pixel sur la carte.
 */
function toGlsl(sksl: string) {
  const body = sksl
    .replace(/\bhalf4\b/g, "vec4")
    .replace(/\bfloat2\b/g, "vec2")
    .replace(/vec4\s+main\s*\(\s*vec2\s+coord\s*\)/, "vec4 effect(vec2 coord)");
  return `#version 300 es
precision highp float;
${body}
uniform vec2 stageView;
uniform float stageZoom;
out vec4 stageColor;
void main() {
  stageColor = effect(vec2(gl_FragCoord.x, stageView.y - gl_FragCoord.y) / stageZoom);
}`;
}

interface Program {
  program: WebGLProgram;
  locations: Map<string, WebGLUniformLocation | null>;
}

interface Layer {
  program: Program;
  position: Point;
  uniforms: Uniform[];
  start: number;
  duration: number;
  done: () => void;
}

export interface Stage {
  animate: Animate;
  /** Pixels du canvas, en CSS, par unité de carte. */
  zoom: () => number;
  clear: () => void;
}

export function createStage(canvas: HTMLCanvasElement, unitsWide: number): Stage | null {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  // Les shaders renvoient des couleurs prémultipliées, comme pour Owlbear.
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const vertex = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vertex, "#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }");
  gl.compileShader(vertex);

  const programs = new Map<string, Program | null>();
  function programFor(sksl: string) {
    if (programs.has(sksl)) return programs.get(sksl)!;
    const fragment = gl!.createShader(gl!.FRAGMENT_SHADER)!;
    gl!.shaderSource(fragment, toGlsl(sksl));
    gl!.compileShader(fragment);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertex);
    gl!.attachShader(program, fragment);
    gl!.bindAttribLocation(program, 0, "a");
    gl!.linkProgram(program);
    let entry: Program | null = { program, locations: new Map() };
    if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
      console.warn("Spellcast FX: shader", gl!.getShaderInfoLog(fragment));
      entry = null;
    }
    programs.set(sksl, entry);
    return entry;
  }

  const location = (p: Program, name: string) => {
    if (!p.locations.has(name)) p.locations.set(name, gl.getUniformLocation(p.program, name));
    return p.locations.get(name)!;
  };

  function setUniform(p: Program, { name, value }: Uniform) {
    const at = location(p, name);
    if (!at) return;
    if (typeof value === "number") gl!.uniform1f(at, value);
    else if (Array.isArray(value)) gl!.uniformMatrix3fv(at, false, value as number[]);
    else if ("z" in value) gl!.uniform3f(at, value.x, value.y, value.z);
    else gl!.uniform2f(at, value.x, value.y);
  }

  const layers: Layer[] = [];
  let scale = 1;
  let running = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scale = w / unitsWide;
    gl!.viewport(0, 0, w, h);
  }

  function frame(now: number) {
    resize();
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const t = (now - layer.start) / layer.duration;
      if (t >= 1) {
        layers.splice(i, 1);
        layer.done();
      }
    }
    for (const layer of layers) {
      const p = layer.program;
      gl!.useProgram(p.program);
      gl!.enableVertexAttribArray(0);
      gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
      // `model` ramène la position sur la carte à l'origine de l'effet.
      gl!.uniformMatrix3fv(location(p, "model"), false, [1, 0, 0, 0, 1, 0, -layer.position.x, -layer.position.y, 1]);
      gl!.uniform2f(location(p, "stageView"), canvas.width, canvas.height);
      gl!.uniform1f(location(p, "stageZoom"), scale);
      setUniform(p, { name: "t", value: Math.max(0, (now - layer.start) / layer.duration) });
      for (const u of layer.uniforms) setUniform(p, u);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }
    if (layers.length) requestAnimationFrame(frame);
    else {
      running = false;
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    }
  }

  const animate: Animate = (sksl, position, uniforms, duration) =>
    new Promise((done) => {
      const program = programFor(sksl);
      if (!program) return done();
      layers.push({ program, position, uniforms, start: performance.now(), duration, done });
      if (!running) {
        running = true;
        requestAnimationFrame(frame);
      }
    });

  return {
    animate,
    zoom: () => canvas.clientWidth / unitsWide,
    clear: () => {
      for (const layer of layers.splice(0)) layer.done();
    },
  };
}
