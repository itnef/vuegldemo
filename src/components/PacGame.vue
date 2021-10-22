<script setup lang="ts">

import {
  ref,
  onMounted,
  VueElement,
  Component,
  reactive,
  defineComponent,
} from "vue";

import someImage from "../assets/static/sprites.png";
import someImage2 from "../assets/static/background1.png";
import soundEffect from "../assets/static/soundeffect1.mp3"

// defineProps<{ score: number }>()
</script>

<template>
  <h2></h2>
  <!-- <h2>{{ hotReloadDetectId }}</h2>
  <h3>{{ errormsg }}</h3> -->
</template>

<script lang="ts">

// Technical stuff
const hotReloadDetectId = Math.random();
const canvas_id = "pacman-canvas";

let gl : WebGLRenderingContext;

const frameUpdateInterval_ms = 25; // 40 per second
// const frameUpdateInterval_ms = 250.0; // for testing only
// const frameUpdateInterval_ms = 16; // > enough per second

var lastTimerTick_ms = window.performance.now();
var startTime2 = (window.performance || Date).now();
let timer: ReturnType<typeof setTimeout> | undefined = undefined;

enum ParticleType {
  Ego = 0,
  Apple = 1,
  Background = 2,
  Ignore = 3, // disabled particle, shall not be displayed
  Tree = 5,
}

enum GameState {
  Uninitialized = 0,
  Running = 1,
  Finished = 2,
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(
  gl: WebGLRenderingContext,
  url: any,
  register: number
): WebGLTexture | null {
  const texture = gl.createTexture();
  gl.activeTexture(register);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 0, 255]); // opaque black

  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    internalFormat,
    width,
    height,
    border,
    srcFormat,
    srcType,
    pixel
  );

  const image = new Image();
  image.onload = function () {
    gl.activeTexture(register);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      level,
      internalFormat,
      srcFormat,
      srcType,
      image
    );

    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  };
  image.src = url;

  return texture;
}

function isPowerOf2(value: number): boolean {
  return (value & (value - 1)) == 0;
}

function sqdist(a: number[], b: number[]): number {
  let result = 0.0;
  for (let i = 0; i < a.length; ++i) {
    result += (a[i] - b[i]) * (a[i] - b[i]);
  }
  return result;
}

const uBackgroundSampler = "u_BackgroundSampler";

const theFragmentShaderProgram = `
#extension GL_EXT_frag_depth : enable

precision lowp float;
varying vec2 v_position;
varying vec3 v_color;
varying float v_overlight;
varying float v_depth;

varying highp vec2 vTextureCoord;

uniform sampler2D u_Sampler;
uniform sampler2D ${uBackgroundSampler};

varying float v_usetexture;

uniform lowp float u_gamestate;
uniform mediump float u_time2; // since gamestate changed


void main() {

  vec4 color = vec4(v_color, 1.0);
  vec4 tex0 = texture2D(u_Sampler, vTextureCoord);
  vec4 tex1 = texture2D(${uBackgroundSampler}, vTextureCoord);

  if (v_usetexture < 0.2) {
    gl_FragColor = color;
  }
  // Sprites texture
  else if (abs(v_usetexture - 1.0) < 0.2) {
    gl_FragColor = tex0;
    // gl_FragColor = vec4(0.0, 1.0, 0.0, 0.0);
  }
  // Background texture
  else if (abs(v_usetexture - 2.0) < 0.2) {
    gl_FragColor = tex1;
    // gl_FragColor = vec4(0.0, 1.0, 1.0, 0.0);
  }
  else { // if (v_usetexture == 3.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  if (abs(u_gamestate - 2.0) < 0.2) {
    gl_FragColor.rgb = 
    mix(gl_FragColor.rgb, gl_FragColor.brg, u_time2);
  }

  gl_FragDepthEXT = v_depth;

  // if(gl_FragColor.a < 0.5) discard;
}
`;

const theVertexShaderProgram = `
precision highp float;

attribute vec2 a_position;
attribute float a_startAngle;
attribute float a_angularVelocity;
attribute float a_rotationAxisAngle;
// attribute float a_particleDistance;
// attribute float a_particleAngle;
attribute vec3 a_xyz;
attribute vec2 a_uv;
attribute float a_particleY;

attribute float a_particleType;

uniform mediump float u_time; // Global state

varying vec2 v_position;
varying vec3 v_color;
varying float v_overlight;
varying float v_depth;

varying vec2 vTextureCoord;
varying float v_usetexture;

uniform lowp float u_gamestate;
uniform mediump float u_time2; // since gamestate changed

void main() {
  float angle = a_startAngle + a_angularVelocity * u_time;

  float vertPosition = a_xyz.z * 1.0;

  mat4 vMatrix = mat4(
    1.3, 0.0, 0.0, 0.0,
    0.0, 1.3, 0.0, 0.0,
    0.0, 0.0, 1.0, 1.0,
    0.0, 0.0, 0.0, 1.0
  );

  mat4 shiftMatrix = mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    a_xyz.x, a_xyz.y, vertPosition, 1.0
    // a_particleDistance * sin(viewAngle), a_particleDistance * cos(viewAngle),  vertPosition, 1.0
  );

  mat4 pMatrix = mat4(
    cos(a_rotationAxisAngle), sin(a_rotationAxisAngle), 0.0, 0.0,
    -sin(a_rotationAxisAngle), cos(a_rotationAxisAngle), 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
  ) * mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, cos(angle), sin(angle), 0.0,
    0.0, -sin(angle), cos(angle), 0.0,
    0.0, 0.0, 0.0, 1.0
  );

  gl_Position = vMatrix * shiftMatrix * pMatrix * vec4(a_position * 0.13, 0.0, 1.0);
  vec4 normal = vec4(0.0, 0.0, 1.0, 0.0);
  vec4 transformedNormal = normalize(pMatrix * normal);

  float dotNormal = abs(dot(normal.xyz, transformedNormal.xyz));
  float regularLighting = dotNormal / 2.0 + 0.5;
  float glanceLighting = smoothstep(0.92, 0.98, dotNormal);

  v_color = vec3(
    mix((0.5 - transformedNormal.z / 2.0) * regularLighting, 1.0, glanceLighting),
    mix(0.5 * regularLighting, 1.0, glanceLighting),
    mix((0.5 + transformedNormal.z / 2.0) * regularLighting, 1.0, glanceLighting)
  );

  if (a_particleType <= 0.2) {
    v_color = vec3(1.0, 0.0, 0.0);
  }

  v_position = a_position;
  v_overlight = 0.9 + glanceLighting * 0.1;
  v_depth = gl_Position.z;

  if (a_particleType == ${ParticleType.Background}.0) {
    v_usetexture = 2.0;
  }
  // transparent no color
  else if (a_particleType == ${ParticleType.Ignore}.0) {
    v_usetexture = 3.0;
  }
  // everything else uses sprite texture
  else {
    v_usetexture = 1.0;
  }

  vTextureCoord = a_uv;
}
`;

// Set up some constants for rendering:
const NUM_PARTICLES = 100;
const NUM_VERTICES = 4;
const NUM_INDICES = 6;

const attrs = [
  { name: "a_position", length: 2, offset: 0 },
  { name: "a_startAngle", length: 1, offset: 2 },
  { name: "a_angularVelocity", length: 1, offset: 3 },
  { name: "a_rotationAxisAngle", length: 1, offset: 4 },
  { name: "a_xyz", length: 3, offset: 5 },
  { name: "a_uv", length: 2, offset: 8 },
  { name: "a_particleType", length: 1, offset: 10 },
];

// TODO compute that correctly
const STRIDE = Object.keys(attrs).length + 4; // simply the sum of the lengths

let vertices = new Float32Array(NUM_PARTICLES * STRIDE * NUM_VERTICES);
let indices = new Uint16Array(NUM_PARTICLES * NUM_INDICES);

let shaderProgram: WebGLProgram | null = null;

let spritesTexture: any = null;
let backgroundTexture: WebGLTexture | null = null;

let NUM_APPLES = 20;
let gamestate = GameState.Uninitialized;

export default defineComponent({
  data() {
    return {
      DIRECTION: [0.0, 1.0],
      speed: 0.0,
      PAC_POSITION: [0.0, 0.0],
      STUFF: new Map() as Map<number, any>,
      GAMESTATE: GameState.Uninitialized,
      score: 0,
      tStart_ms: 0.0,
      finishedAt_ms: 0.0,
      errormsg: "",
      istep: 0,
      // TODO adapt to changes of displayed size?
      canvas_width: 768,
      canvas_height: 768,
      gl_context: null as WebGLRenderingContext | null,
      ODOMETER: 0.0
    };
  },

  destroyed() {
    this.clearTimers();
  },

  mounted() {
    this.reInitialize();
    this.destroyOldCanvas();

    let canvas = this.setupCanvas();

    this.setupAndRenderGL(canvas, this.tStart_ms);

    let listn = function (this: any, e: KeyboardEvent) {
      this.handleKeypress(e);
      // e.stopImmediatePropagation();
      // this.setupAndRenderGL();
    }.bind(this);

    window.addEventListener("keydown", listn);

    this.setupTimers(listn);
  },

  methods: {
    reInitialize(): void {
      this.DIRECTION = [0.0, 0.0];
      this.PAC_POSITION = [0.0, 0.0];
      this.tStart_ms = window.performance.now();
      this.STUFF = new Map();
      this.GAMESTATE = GameState.Running;
      gamestate = this.GAMESTATE;
      this.ODOMETER = 0.0;
      this.finishedAt_ms = this.tStart_ms;
      this.reset_score();
      this.reset_game_message();

      let j = 0;

      this.STUFF.set(j++, { pos: [0.0, 0.0], type: ParticleType.Background });

      for (let i = 0; i < NUM_APPLES; i++) {
        let px = 2 * Math.random() - 1;
        let py = 2 * Math.random() - 1;

        this.STUFF.set(j++, {
          pos: [px, py],
          type: ParticleType.Apple,
          // relevant to finish the level?
          relevant: true,
        });
      }

      this.STUFF.set(j++, { pos: this.PAC_POSITION, type: ParticleType.Ego });

      this.istep = 0;
    },

    add_score(amount: number): void {
      this.score += amount;
      this.$emit("setScore", this.score);
    },

    reset_score(): void {
      this.score = 0;
      this.$emit("setScore", this.score);
    },

    reset_game_message(): void {
      this.$emit("setGameMessage", "");
    },

    // ...level...
    checkFinished(): boolean {
      if (this.STUFF === null || this.STUFF === undefined) {
        return false;
      }
      return (
        Array.from(this.STUFF.values()).filter(
          (entry: any) => entry.relevant && !entry.disabled
        ).length == 0
      );
    },

    updateState(): void {
      const tLast_ms = lastTimerTick_ms;
      const tNow_ms = window.performance.now();
      const diff_ms = tNow_ms - tLast_ms;

      if (diff_ms == 0.0) {
        // called too early: ignore
        return;
      }

      if (this.GAMESTATE === GameState.Finished && tNow_ms - this.finishedAt_ms >= 1000) {
          this.reInitialize();
          return;
      }

      // limit for hitting objects ...
      let limit = 1.25; // TODO compute this properly from object geometry.

      if (this.GAMESTATE === GameState.Running) {
        this.PAC_POSITION[0] +=
          this.DIRECTION[0] * 0.001 * this.speed * diff_ms;
        this.PAC_POSITION[1] +=
          this.DIRECTION[1] * 0.001 * this.speed * diff_ms;

        this.ODOMETER += (Math.abs(this.DIRECTION[0]) + Math.abs(this.DIRECTION[1])) * 0.001 * this.speed * diff_ms;
        this.$emit("setOdometer", this.ODOMETER);

        if (this.PAC_POSITION[1] > limit && this.DIRECTION[1] > 0.0)
          this.PAC_POSITION[1] = -limit;
        if (this.PAC_POSITION[1] < -limit && this.DIRECTION[1] < 0.0)
          this.PAC_POSITION[1] = +limit;
        if (this.PAC_POSITION[0] > limit && this.DIRECTION[0] > 0.0)
          this.PAC_POSITION[0] = -limit;
        if (this.PAC_POSITION[0] < -limit && this.DIRECTION[0] < 0.0)
          this.PAC_POSITION[0] = +limit;

        // TODO optimize
        this.STUFF.forEach((value, key) => {
          if (value["disabled"]) {
            return;
          }
          if (value["type"] == ParticleType.Apple) {
            let sq = sqdist(this.PAC_POSITION, value["pos"]);

            // TODO this was determined by trial and error.
            // Detecting collisions would be a big step towards a proper game engine
            if (Math.sqrt(sq) <= 0.08) {
              value["disabled"] = true;

              this.add_score(200); // TODO depending on kind of object

              // tree probability
              if (Math.random() <= 1.0) {
                value["disabled"] = false;
                value["type"] = ParticleType.Tree;
                value["relevant"] = false;
              }
            }
          }
        });
      }

      if (this.GAMESTATE === GameState.Running && this.checkFinished()) {
        this.GAMESTATE = GameState.Finished;
        gamestate = this.GAMESTATE;
        this.finishedAt_ms = window.performance.now();
        startTime2 = (window.performance || Date).now();
        this.$emit("setGameMessage", "yay!");
        var audio = new Audio(soundEffect);
        audio.play();
      }

      let canvas = document.getElementById(canvas_id);
      if (canvas instanceof HTMLCanvasElement) {
        this.setupAndRenderGL(canvas, tNow_ms);
      } else {
        // display error message and stop
      }

      lastTimerTick_ms = tNow_ms;
      this.istep++;
    },

    handleKeypress(e: KeyboardEvent) {
      // console.log(`handle keypress: ${e.key}`);
      // console.log(String.fromCharCode(e.keyCode));

      switch (e.key) {
        case "ArrowDown":
        case "2": {
          this.speed = 1.0;
          this.DIRECTION = [0.0, -1.0];
          break;
        }
        case "ArrowUp":
        case "8": {
          this.speed = 1.0;
          this.DIRECTION = [0.0, +1.0];
          break;
        }
        case "ArrowLeft":
        case "4": {
          this.speed = 1.0;
          this.DIRECTION = [-1.0, 0.0];
          break;
        }
        case "ArrowRight":
        case "6": {
          this.speed = 1.0;
          this.DIRECTION = [+1.0, 0.0];
          break;
        }
        case " ":
        case "5": {
          this.speed = 0.0;
          break;
        }
        case "0": {
          this.reInitialize();
        }
      }
    },

    clearTimers() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },

    setupTimers(listn: any): void {
      var self = this;

      const hcdi = hotReloadDetectId;

      timer = setTimeout(function myTimer() {
        // console.log(`tick #${i} (${hcdi})`);
        // i++;

        const existingCanvas = document.getElementById(canvas_id);
        if (existingCanvas === null) {
          return;
        }

        for (let i = 0; i < existingCanvas.children.length; i++) {
          let child = existingCanvas.childNodes[i];

          if (child instanceof HTMLDivElement) {
            if (child.id == `${hcdi}`) {
              self.updateState();
              timer = setTimeout(myTimer, frameUpdateInterval_ms);
            } else {
              // console.log(`${child.id} <-> ${hcdi} hot reload detected, cleaning up`);

              window.removeEventListener("keydown", listn);
              self.clearTimers();
            }
          }
        }
      }, frameUpdateInterval_ms);
    },

    setupCanvas(): HTMLCanvasElement {
      const canvas = document.createElement("canvas");
      canvas.id = canvas_id;
      canvas.style.backgroundColor = "#0078D4";
      // https://stackoverflow.com/questions/39276191/webgl-image-rendering-bad-quality
      // canvas.style.width = `${this.canvas_width}px`;
      // const canvasContainer = document.getElementById("canvasContainer");
      canvas.style.height = "100%";
      canvas.style.maxWidth  = "768px";
      canvas.style.maxHeight = "768px";
      // 100%"; <- smudges
      // canvas.style.height = `${this.canvas_height}px`;
      canvas.width = this.canvas_width;
      canvas.height = this.canvas_height;

      canvas.style.paddingTop = "0";

      const child = document.createElement("div");
      child.id = `${hotReloadDetectId}`;
      canvas.appendChild(child);

      return canvas;
    },

    destroyOldCanvas() {
      const existingCanvas = document.getElementById(canvas_id);
      if (existingCanvas && existingCanvas.parentElement) {
        existingCanvas.parentElement.removeChild(existingCanvas);
      }
    },

    setupGL(gl: any): WebGLProgram | null {
      if (spritesTexture === null) {
        spritesTexture = loadTexture(gl, someImage, gl.TEXTURE0);
      }
      if (backgroundTexture === null) {
        backgroundTexture = loadTexture(gl, someImage2, gl.TEXTURE1);
        // backgroundTexture = makeTexture(gl, gl.TEXTURE1, this.canvas_width, this.canvas_height)
      }

      if (gl === null) {
        this.errormsg = "could not get webgl context";
        return null;
      }

      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      if (vertexShader === null) {
        this.errormsg = "could not create vertex shader";
        return null;
      }

      function cCheck(shader: any) {
        var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        console.log(`Shader compiled ${compiled ? "" : "un"}successfully`);
        if (compiled == false) {
          var compilationLog = gl.getShaderInfoLog(shader);
          console.log("Shader compiler log: " + compilationLog);
        }
      }

      gl.shaderSource(vertexShader, theVertexShaderProgram);
      gl?.compileShader(vertexShader);
      cCheck(vertexShader);

      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      if (fragmentShader === null) {
        this.errormsg = "could not create fragment shader";
        return null;
      }
      gl.shaderSource(fragmentShader, theFragmentShaderProgram);
      gl.compileShader(fragmentShader);
      cCheck(fragmentShader);

      const shaderProgram = gl.createProgram();
      if (shaderProgram === null) {
        this.errormsg = "could not compile shader program";
        // TODO show compile errors
        return null;
      }

      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      gl.useProgram(shaderProgram);

      return shaderProgram;
    },

    setupAndRenderGL(canvas: HTMLCanvasElement, tNow_ms: number) {
      if (canvas === undefined) {
        console.debug("render: canvas not yet defined");
        return;
      }

      gl = canvas.getContext("webgl");

      // is this any good!?
      // if (gl !== this.gl_context) {
      //  shaderProgram = null;
      //  this.gl_context = gl;
      //  // start anew. ?
      // }

      // let's try this solution:
      // https://stackoverflow.com/a/61023200
      canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();  // allows the context to be restored
      });
      canvas.addEventListener("webglcontextrestored", (e) => {
        this.setupGL(gl);
      });

      gl?.getExtension("EXT_frag_depth");

      if (gl === null) {
        this.errormsg = "could not get webgl context";
        return;
      }

      if (shaderProgram === null) {
        shaderProgram = this.setupGL(gl);
      }
      if (shaderProgram === null) {
        this.errormsg += "could not get shader program";
        return;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());

      for (var i = 0; i < attrs.length; i++) {
        const name = attrs[i].name;
        const length = attrs[i].length;
        const offset = attrs[i].offset;

        const attribLocation = gl.getAttribLocation(shaderProgram, name);
        if (attribLocation == -1) {
          console.error(
            "name does not correspond to an attribute location in the shader program: " +
              name
          );
        }

        gl.vertexAttribPointer(
          attribLocation,
          length,
          gl.FLOAT,
          false,
          STRIDE * 4,
          offset * 4
        );
        gl.enableVertexAttribArray(attribLocation);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());

      // Compute particle parameters to visualize scene

      for (let i = 0; i < NUM_PARTICLES; i++) {
        if (!this.STUFF.has(i)) {
          let particleType = ParticleType.Ignore;
          continue;
        }

        // console.log(`${i} -> ${this.STUFF[i]}`)

        let axisAngle = 0.0; // Math.random() * Math.PI * 2;
        const startAngle = 0.0; // Math.random() * Math.PI * 2;
        const groupPtr = i * STRIDE * NUM_VERTICES;

        const angularVelocity = 1.0;

        let px = this.STUFF.get(i)["pos"][0];
        let py = this.STUFF.get(i)["pos"][1];
        let pz = 0.9999;

        let disabled = false;

        if (this.STUFF.get(i)) {
          disabled = this.STUFF.get(i)["disabled"];
        }

        let particleType = disabled
          ? ParticleType.Ignore
          : this.STUFF.get(i)["type"];

        if (particleType == ParticleType.Background) {
          px = 0.0;
          py = 0.0;
          pz = 1.0;
        }
        if (particleType == ParticleType.Ego) {
          py = this.PAC_POSITION[1];
          px = this.PAC_POSITION[0];
          pz = 0.9998; // 1.0-2*1e-5;
          axisAngle = Math.atan2(this.DIRECTION[1], this.DIRECTION[0]);
        } else {
          //
        }

        for (let j = 0; j < 4; j++) {
          const vertexPtr = groupPtr + j * STRIDE;
          vertices[vertexPtr + 2] = startAngle;
          vertices[vertexPtr + 3] = angularVelocity;
          vertices[vertexPtr + 4] = axisAngle;

          if (this.istep == 0 || particleType == ParticleType.Ego) {
            vertices[vertexPtr + 5] = px;
            vertices[vertexPtr + 6] = py;
            vertices[vertexPtr + 7] = pz;
          }

          // ParticleType
          vertices[vertexPtr + 10] = particleType;
        }

        let xbase = -1;
        let ybase = -1;
        let xstep = 2;
        let ystep = 2;

        // Coordinates on 2D scene prior to transformation
        // x,y, x,y, x,y, x,y
        if (particleType == ParticleType.Background) {
          xbase = -10;
          ybase = -10;
          xstep = 20;
          ystep = 20;
        }
        vertices[groupPtr] = xbase;
        vertices[groupPtr + 1] = ybase;
        vertices[groupPtr + STRIDE] = xbase + xstep;
        vertices[groupPtr + STRIDE + 1] = ybase;
        vertices[groupPtr + STRIDE * 2] = xbase;
        vertices[groupPtr + STRIDE * 2 + 1] = ybase + ystep;
        vertices[groupPtr + STRIDE * 3] = xbase + xstep;
        vertices[groupPtr + STRIDE * 3 + 1] = ybase + ystep;

        let ubase = 0;
        let vbase = 0;

        // TODO read image dimensions from image?
        let ustep = 64 / 256;
        let vstep = ustep;

        if (particleType == ParticleType.Ego) {
          if (Math.floor((tNow_ms - this.tStart_ms) / 500.0) % 2 == 0) {
            vbase = 1 * ustep;
          }
        } else if (particleType == ParticleType.Tree) {
          ubase = 3 * ustep;
        } else if (particleType == ParticleType.Apple) {
          ubase = 1 * ustep;
        } else if (particleType == ParticleType.Background) {
          ubase = 0;
          vbase = 0;
          ustep = 1;
          vstep = 1;
        }

        // texture coordinates u, v
        vertices[groupPtr + 8] = ubase;
        vertices[groupPtr + 9] = vbase + vstep;
        vertices[groupPtr + 8 + STRIDE] = ubase + ustep;
        vertices[groupPtr + 9 + STRIDE] = vbase + vstep;
        vertices[groupPtr + 8 + STRIDE * 2] = ubase;
        vertices[groupPtr + 9 + STRIDE * 2] = vbase;
        vertices[groupPtr + 8 + STRIDE * 3] = ubase + ustep;
        vertices[groupPtr + 9 + STRIDE * 3] = vbase;

        const indicesPtr = i * NUM_INDICES;
        const vertexPtr = i * NUM_VERTICES;

        indices[indicesPtr] = vertexPtr;

        indices[indicesPtr + 4] = indices[indicesPtr + 1] = vertexPtr + 1;
        indices[indicesPtr + 3] = indices[indicesPtr + 2] = vertexPtr + 2;
        indices[indicesPtr + 5] = vertexPtr + 3;
      }

      // Pass in the data to the WebGL context
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

      const uSamplerLoc = gl.getUniformLocation(shaderProgram, "u_Sampler");
      const uBackgroundSamplerLoc = gl.getUniformLocation(
        shaderProgram,
        uBackgroundSampler
      );

      gl.uniform1i(uSamplerLoc, 0);
      gl.uniform1i(uBackgroundSamplerLoc, 1);

      const startTime = (window.performance || Date).now();

      const timeUniformLocation = gl.getUniformLocation(
        shaderProgram,
        "u_time"
      );
      
      const time2UniformLocation = gl.getUniformLocation(
        shaderProgram,
        "u_time2"
      );

      const gamestateUniformLocation = gl.getUniformLocation(
        shaderProgram,
        "u_gamestate"
      );

      // if (gl.getSupportedExtensions().indexOf("EXT_frag_depth") >= 0) {
      //   // TODO
      // }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.clearDepth(1.0);
      gl.clearColor(0, 0, 0.0, 1.0);

      // Allow alpha channels on in the vertex shader
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.depthRange(0.0, 1.0);

      // Set the WebGL context to be the full size of the canvas
      // let m = Math.min(canvas.width, canvas.height);
      // https://webglfundamentals.org/webgl/lessons/webgl-anti-patterns.html
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

      // Finish computing the frame:
      function frame() {
        if (gl === null) {
          return;
        }
        gl.uniform1f(
          timeUniformLocation,
          ((window.performance || Date).now() - startTime) / 1000
        );
        gl.uniform1f(
          time2UniformLocation,
          ((window.performance || Date).now() - startTime2) / 1000
        );
        // "this" not available in this closure
        gl.uniform1f(
          gamestateUniformLocation,
          gamestate,
        )

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawElements(
          gl.TRIANGLES,
          NUM_INDICES * NUM_PARTICLES,
          gl.UNSIGNED_SHORT,
          0
        );
      }

      frame();

      if (canvas.parentElement === null) {
        document.body.appendChild(canvas);
      }

      return [canvas, shaderProgram];
    },
  },
});
</script>

<style scoped>
</style>
