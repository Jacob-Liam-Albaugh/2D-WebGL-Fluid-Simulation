/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

// Import managers for their functionality
import { applyBloom, initBloomFramebuffers, initBloomShaders } from './bloomManager';
import { drawColor as drawBackgroundColor, getRandomColor, initColorShaders, setColorScheme } from './colorManager';
import { applyCurl, applyDivergence, applyGradientSubtract, applyPressure, applyVorticity, initPhysicsShaders } from './physicsManager';
import { applyAdvection, handlePointerSplat, initSplatShaders } from './splatManager';
import { applySunrays, applySunraysBlur, initSunraysFramebuffers, initSunraysShaders } from './sunraysManager';

/**
 * @typedef {import('./splatManager').SplatProgram} SplatProgram
 * @typedef {import('./splatManager').AdvectionProgram} AdvectionProgram
 * @typedef {import('./splatManager').SplatConfig} SplatConfig
 * @typedef {import('./splatManager').SplatFramebuffer} SplatFramebuffer
 * @typedef {import('./splatManager').SplatColor} SplatColor
 */

/**
 * @typedef {import('./physicsManager').PhysicsConfig} PhysicsConfig
 * @typedef {import('./physicsManager').SinglePhysicsFramebuffer} SinglePhysicsFramebuffer
 * @typedef {import('./physicsManager').DoublePhysicsFramebuffer} DoublePhysicsFramebuffer
 * @typedef {import('./physicsManager').PhysicsPrograms} PhysicsPrograms
 */

/**
 * @typedef {import('./sunraysManager').SunraysConfig} SunraysConfig
 * @typedef {import('./sunraysManager').SunraysFramebuffer} SunraysFramebuffer
 * @typedef {import('./sunraysManager').SunraysPrograms} SunraysPrograms
 */

/**
 * @typedef {import('./colorManager').Program} ColorProgram
 * @typedef {import('./colorManager').RGBColor} RGBColor
 */

/**
 * @typedef {import('./bloomManager').BloomConfig} BloomConfig
 * @typedef {import('./bloomManager').BloomFramebuffer} BloomFramebuffer
 * @typedef {import('./bloomManager').BloomPrograms} BloomPrograms
 */

/**
 * @typedef {import('./colorConfigurations').ColorConfiguration} ColorConfiguration
 */

/**
 * @typedef {RGBColor} Color
 */

/**
 * @typedef {ColorConfiguration} ColorScheme
 */

/**
 * @typedef {Object} SimulationConfig
 * @property {number} SIM_RESOLUTION - Resolution for simulation calculations
 * @property {number} DYE_RESOLUTION - Resolution for dye calculations
 * @property {number} DENSITY_DISSIPATION - Rate at which density dissipates
 * @property {number} VELOCITY_DISSIPATION - Rate at which velocity dissipates
 * @property {number} PRESSURE - Pressure constant
 * @property {number} PRESSURE_ITERATIONS - Number of pressure iterations
 * @property {number} CURL - Curl constant
 * @property {number} SPLAT_RADIUS - Radius of splats
 * @property {number} SPLAT_FORCE - Force of splats
 * @property {number} COLOR_UPDATE_SPEED - Speed of color updates
 * @property {Color} BACK_COLOR - Background color
 * @property {number} BLOOM_ITERATIONS - Number of bloom iterations
 * @property {number} BLOOM_RESOLUTION - Resolution for bloom effect
 * @property {number} BLOOM_INTENSITY - Intensity of bloom effect
 * @property {number} BLOOM_THRESHOLD - Threshold for bloom effect
 * @property {number} BLOOM_SOFT_KNEE - Soft knee parameter for bloom
 * @property {number} SUNRAYS_RESOLUTION - Resolution for sunrays effect
 * @property {number} SUNRAYS_WEIGHT - Weight of sunrays effect
 * @property {ColorScheme} COLOR_SCHEME - Current color scheme
 */

/**
 * @typedef {Object} Pointer
 * @property {number} id - Unique identifier
 * @property {number} texcoordX - Current X texture coordinate
 * @property {number} texcoordY - Current Y texture coordinate
 * @property {number} prevTexcoordX - Previous X texture coordinate
 * @property {number} prevTexcoordY - Previous Y texture coordinate
 * @property {number} deltaX - Change in X position
 * @property {number} deltaY - Change in Y position
 * @property {boolean} down - Whether pointer is pressed
 * @property {boolean} moved - Whether pointer has moved
 * @property {Color} color - Current color
 */

/**
 * @typedef {SplatFramebuffer} FBO
 */

/**
 * @typedef {DoublePhysicsFramebuffer} DoubleFBO
 */

/**
 * @typedef {Object} WebGLContext
 * @property {WebGLRenderingContext} gl - The WebGL context
 * @property {Object} ext - WebGL extensions
 * @property {Object} ext.formatRGBA - RGBA format info
 * @property {Object} ext.formatRG - RG format info
 * @property {Object} ext.formatR - R format info
 * @property {number} ext.halfFloatTexType - Half float texture type
 * @property {boolean} ext.supportLinearFiltering - Whether linear filtering is supported
 */

// Simulation section
/** @type {HTMLCanvasElement} */
const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

/** @type {SimulationConfig & PhysicsConfig & BloomConfig & SunraysConfig & SplatConfig} */
let config = {
    SIM_RESOLUTION: 1024,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 1,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.01,
    SPLAT_FORCE: 6000,
    COLOR_UPDATE_SPEED: 10,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.3,
    BLOOM_THRESHOLD: 0.0,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 0.2,
    COLOR_SCHEME: 'dusk'
};

/**
 * @param {string} [scheme=config.COLOR_SCHEME] - The color scheme to initialize
 * @returns {void}
 */
function initColorScheme(scheme = config.COLOR_SCHEME) {
    setColorScheme(scheme);
}

/**
 * @returns {Color} A random color from the current scheme
 */
function getColorFromScheme() {
    return getRandomColor();
}

// Initialize the default color scheme
initColorScheme();

/**
 * @constructor
 * @returns {Pointer} A new pointer instance
 */
function pointerPrototype() {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = getColorFromScheme();
}

/** @type {Pointer[]} */
let pointers = [];
pointers.push(new pointerPrototype());

/** @type {{gl: WebGLRenderingContext, ext: Object}} */
const { gl, ext } = getWebGLContext(canvas);

/**
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @returns {WebGLContext} WebGL context and extensions
 */
function getWebGLContext(canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    /** @type {WebGLRenderingContext|null} */
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    /** @type {Object|null} */
    let halfFloat;
    /** @type {Object|null} */
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    /** @type {{internalFormat: number, format: number}|null} */
    let formatRGBA;
    /** @type {{internalFormat: number, format: number}|null} */
    let formatRG;
    /** @type {{internalFormat: number, format: number}|null} */
    let formatR;

    if (isWebGL2) {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    } else {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

/**
 * @param {WebGLRenderingContext} gl - The WebGL context
 * @param {number} internalFormat - The internal format of the texture
 * @param {number} format - The format of the texture
 * @param {number} type - The type of the texture
 * @returns {{internalFormat: number, format: number}|null} The supported format or null
 */
function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
        switch (internalFormat) {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    };
}

/**
 * @param {WebGLRenderingContext} gl - The WebGL context
 * @param {number} internalFormat - The internal format of the texture
 * @param {number} format - The format of the texture
 * @param {number} type - The type of the texture
 * @returns {boolean} Whether the format is supported
 */
function supportRenderTextureFormat(gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

/**
 * @class
 * @implements {ColorProgram}
 */
class Material {
    /**
     * @param {WebGLShader} vertexShader - The vertex shader
     * @param {string} fragmentShaderSource - The fragment shader source code
     */
    constructor(vertexShader, fragmentShaderSource) {
        /** @type {WebGLShader} */
        this.vertexShader = vertexShader;
        /** @type {string} */
        this.fragmentShaderSource = fragmentShaderSource;
        /** @type {WebGLProgram[]} */
        this.programs = [];
        /** @type {WebGLProgram|null} */
        this.activeProgram = null;
        /** @type {Object.<string, WebGLUniformLocation>} */
        this.uniforms = [];
    }

    /**
     * @param {string[]} keywords - Shader keywords to set
     * @returns {void}
     */
    setKeywords(keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    /**
     * @returns {void}
     */
    bind() {
        gl.useProgram(this.activeProgram);
    }
}

/**
 * @class
 * @implements {ColorProgram}
 */
class Program {
    /**
     * @param {WebGLShader} vertexShader - The vertex shader
     * @param {WebGLShader} fragmentShader - The fragment shader
     */
    constructor(vertexShader, fragmentShader) {
        /** @type {Object.<string, WebGLUniformLocation>} */
        this.uniforms = {};
        /** @type {WebGLProgram} */
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    /**
     * @returns {void}
     */
    bind() {
        gl.useProgram(this.program);
    }
}

/**
 * @param {WebGLShader} vertexShader - The vertex shader
 * @param {WebGLShader} fragmentShader - The fragment shader
 * @returns {WebGLProgram} The created program
 */
function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

/**
 * @param {WebGLProgram} program - The WebGL program
 * @returns {Object.<string, WebGLUniformLocation>} The uniforms
 */
function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

/**
 * @param {number} type - The type of shader
 * @param {string} source - The shader source code
 * @param {string[]} [keywords] - Optional keywords to add
 * @returns {WebGLShader} The compiled shader
 */
function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

/**
 * @param {string} source - The shader source code
 * @param {string[]} [keywords] - Optional keywords to add
 * @returns {string} The modified source code
 */
function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

/** @type {WebGLShader} */
const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

/** @type {WebGLShader} */
const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

/** @type {WebGLShader} */
const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`);

/** @type {string} */
const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;

        vec3 bloom = texture2D(uBloom, vUv).rgb;

        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
        bloom *= sunrays;

        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;


const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();


/** @type {DoubleFBO} */
let dye;
/** @type {DoubleFBO} */
let velocity;
/** @type {SinglePhysicsFramebuffer} */
let divergence;
/** @type {SinglePhysicsFramebuffer} */
let curl;
/** @type {DoubleFBO} */
let pressure;
/** @type {BloomFramebuffer} */
let bloom;
/** @type {BloomFramebuffer[]} */
let bloomFramebuffers = [];
/** @type {SunraysFramebuffer} */
let sunrays;
/** @type {SunraysFramebuffer} */
let sunraysTemp;

/** @type {{texture: WebGLTexture, width: number, height: number, attach: (id: number) => number}} */
let ditheringTexture = createTextureAsync('/src/LDR_LLL1_0.png');

// Initialize physics shaders
const physicsShaders = initPhysicsShaders(gl, baseVertexShader, compileShader);

// Create physics programs
/** @type {PhysicsPrograms['pressure']} */
const pressureProgram = new Program(baseVertexShader, physicsShaders.pressureShader);
/** @type {PhysicsPrograms['divergence']} */
const divergenceProgram = new Program(baseVertexShader, physicsShaders.divergenceShader);
/** @type {PhysicsPrograms['curl']} */
const curlProgram = new Program(baseVertexShader, physicsShaders.curlShader);
/** @type {PhysicsPrograms['vorticity']} */
const vorticityProgram = new Program(baseVertexShader, physicsShaders.vorticityShader);
/** @type {PhysicsPrograms['gradientSubtract']} */
const gradienSubtractProgram = new Program(baseVertexShader, physicsShaders.gradientSubtractShader);

// Initialize sunrays programs
const sunraysShaders = initSunraysShaders(gl, baseVertexShader, (type, source) => compileShader(type, source));
/** @type {SunraysPrograms['sunraysMask']} */
const sunraysMaskProgram = new Program(baseVertexShader, sunraysShaders.sunraysMaskShader);
/** @type {SunraysPrograms['sunrays']} */
const sunraysProgram = new Program(baseVertexShader, sunraysShaders.sunraysShader);
/** @type {SunraysPrograms['blur']} */
const blurProgram = new Program(sunraysShaders.blurVertexShader, sunraysShaders.blurShader);

// Initialize bloom shaders and create programs
const bloomShaders = initBloomShaders(gl, baseVertexShader, (type, source) => compileShader(type, source));
/** @type {BloomPrograms['bloomPrefilter']} */
const bloomPrefilterProgram = new Program(baseVertexShader, bloomShaders.bloomPrefilterShader);
/** @type {BloomPrograms['bloomBlur']} */
const bloomBlurProgram = new Program(baseVertexShader, bloomShaders.bloomBlurShader);
/** @type {BloomPrograms['bloomFinal']} */
const bloomFinalProgram = new Program(baseVertexShader, bloomShaders.bloomFinalShader);

// Initialize splat and advection shaders
const splatShaders = initSplatShaders(gl, baseVertexShader, compileShader);
/** @type {SplatProgram} */
const splatProgram = new Program(baseVertexShader, splatShaders.splatShader);
/** @type {AdvectionProgram} */
const advectionProgram = new Program(baseVertexShader, splatShaders.advectionShader);

// Initialize color shaders
const colorShaders = initColorShaders(gl, baseVertexShader, compileShader);
/** @type {ColorProgram} */
const colorProgram = new Program(baseVertexShader, colorShaders.colorShader);

/** @type {ColorProgram} */
const copyProgram = new Program(baseVertexShader, copyShader);
/** @type {ColorProgram} */
const clearProgram = new Program(baseVertexShader, clearShader);

/** @type {ColorProgram} */
const displayMaterial = new Material(baseVertexShader, displayShaderSource);

/**
 * @returns {void}
 */
function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    bloom = createFBO(simRes.width, simRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    bloomFramebuffers = initBloomFramebuffers(gl, {
        iterations: config.BLOOM_ITERATIONS,
        resolution: config.BLOOM_RESOLUTION,
        intensity: config.BLOOM_INTENSITY,
        threshold: config.BLOOM_THRESHOLD,
        softKnee: config.BLOOM_SOFT_KNEE
    }, createFBO, getResolution, ext);

    const { sunrays: newSunrays, temp: newSunraysTemp } = initSunraysFramebuffers(gl, {
        resolution: config.SUNRAYS_RESOLUTION,
        weight: config.SUNRAYS_WEIGHT
    }, createFBO, getResolution, ext);

    sunrays = newSunrays;
    sunraysTemp = newSunraysTemp;
}

/**
 * @param {number} w - Width of the FBO
 * @param {number} h - Height of the FBO
 * @param {number} internalFormat - Internal format of the texture
 * @param {number} format - Format of the texture
 * @param {number} type - Type of the texture
 * @param {number} param - Texture parameter
 * @returns {FBO} The created FBO object
 */
function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

/**
 * @param {number} w - Width of the double FBO
 * @param {number} h - Height of the double FBO
 * @param {number} internalFormat - Internal format of the texture
 * @param {number} format - Format of the texture
 * @param {number} type - Type of the texture
 * @param {number} param - Texture parameter
 * @returns {DoubleFBO} The created double FBO object
 */
function createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    };
}

/**
 * @param {FBO} target - Target FBO to resize
 * @param {number} w - New width
 * @param {number} h - New height
 * @param {number} internalFormat - Internal format of the texture
 * @param {number} format - Format of the texture
 * @param {number} type - Type of the texture
 * @param {number} param - Texture parameter
 * @returns {FBO} The resized FBO
 */
function resizeFBO(target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
}

/**
 * @param {DoubleFBO} target - Target double FBO to resize
 * @param {number} w - New width
 * @param {number} h - New height
 * @param {number} internalFormat - Internal format of the texture
 * @param {number} format - Format of the texture
 * @param {number} type - Type of the texture
 * @param {number} param - Texture parameter
 * @returns {DoubleFBO} The resized double FBO
 */
function resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
    if (target.width == w && target.height == h)
        return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
}

/**
 * @param {string} url - URL of the texture to load
 * @returns {{texture: WebGLTexture, width: number, height: number, attach: function(number): number}} The created texture object
 */
function createTextureAsync(url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    let obj = {
        texture,
        width: 1,
        height: 1,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };

    let image = new Image();
    image.onload = () => {
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };
    image.src = url;

    return obj;
}

/**
 * @returns {void}
 */
function updateKeywords() {
    let displayKeywords = [];
    displayKeywords.push("SHADING");
    displayKeywords.push("BLOOM");
    displayKeywords.push("SUNRAYS");
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();

let lastUpdateTime = Date.now();
update();

/**
 * @returns {void}
 */
function update() {
    const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
    applyInputs();
    step(dt);
    render(null);
    requestAnimationFrame(update);
}

/**
 * @returns {number} The delta time in seconds
 */
function calcDeltaTime() {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

/**
 * @returns {boolean} Whether the canvas was resized
 */
function resizeCanvas() {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

/**
 * @returns {void}
 */
function applyInputs() {
    pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}

/**
 * @param {number} dt - Delta time in seconds
 * @returns {void}
 */
function step(dt) {
    gl.disable(gl.BLEND);

    // Apply curl and vorticity
    applyCurl(gl, velocity, curl, { curl: curlProgram }, blit);
    applyVorticity(gl, config, dt, velocity, curl, { vorticity: vorticityProgram }, blit);

    // Apply divergence and pressure
    applyDivergence(gl, velocity, divergence, { divergence: divergenceProgram }, blit);
    
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    applyPressure(gl, config, pressure, divergence, { pressure: pressureProgram }, blit);
    applyGradientSubtract(gl, pressure, velocity, { gradientSubtract: gradienSubtractProgram }, blit);

    // Apply advection to velocity
    applyAdvection(
        gl,
        velocity,
        velocity,
        dt,
        config.VELOCITY_DISSIPATION,
        advectionProgram,
        blit,
        ext.supportLinearFiltering
    );

    // Apply advection to dye
    applyAdvection(
        gl,
        velocity,
        dye,
        dt,
        config.DENSITY_DISSIPATION,
        advectionProgram,
        blit,
        ext.supportLinearFiltering
    );
}

/**
 * @param {FBO|null} target - The render target
 * @returns {void}
 */
function render(target) {
    applyBloom(gl, {
        iterations: config.BLOOM_ITERATIONS,
        resolution: config.BLOOM_RESOLUTION,
        intensity: config.BLOOM_INTENSITY,
        threshold: config.BLOOM_THRESHOLD,
        softKnee: config.BLOOM_SOFT_KNEE
    }, dye.read, bloom, blit, {
        bloomPrefilter: bloomPrefilterProgram,
        bloomBlur: bloomBlurProgram,
        bloomFinal: bloomFinalProgram
    });

    applySunrays(gl, {
        resolution: config.SUNRAYS_RESOLUTION,
        weight: config.SUNRAYS_WEIGHT
    }, dye.read, dye.write, sunrays, blit, {
        sunraysMask: sunraysMaskProgram,
        sunrays: sunraysProgram
    });

    applySunraysBlur(gl, sunrays, sunraysTemp, 1, blurProgram, blit);

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    drawBackgroundColor(gl, target, config.BACK_COLOR, colorProgram, blit);
    drawDisplay(target);
}

/**
 * @param {FBO|null} target - The render target
 * @returns {void}
 */
function drawDisplay(target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    displayMaterial.bind();
    gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
    gl.uniform1i(displayMaterial.uniforms.uDithering, ditheringTexture.attach(2));
    let scale = getTextureScale(ditheringTexture, width, height);
    gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
    gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    blit(target);
}

/**
 * @param {Pointer} pointer - The pointer object
 * @returns {void}
 */
function splatPointer(pointer) {
    handlePointerSplat(
        pointer,
        {
            SPLAT_FORCE: config.SPLAT_FORCE,
            SPLAT_RADIUS: config.SPLAT_RADIUS
        },
        gl,
        velocity,
        dye,
        canvas,
        splatProgram,
        blit
    );
}

/**
 * @param {number} radius - The radius to correct
 * @returns {number} The corrected radius
 */
function correctRadius(radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

canvas.addEventListener('mousedown', /** @param {MouseEvent} e */ e => {
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    let pointer = pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', /** @param {MouseEvent} e */ e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

/**
 * @param {Pointer} pointer - The pointer object
 * @param {number} id - The pointer ID
 * @param {number} posX - X position
 * @param {number} posY - Y position
 * @returns {void}
 */
function updatePointerDownData(pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = getColorFromScheme();
}

/**
 * @param {Pointer} pointer - The pointer object
 * @param {number} posX - X position
 * @param {number} posY - Y position
 * @returns {void}
 */
function updatePointerMoveData(pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

/**
 * @param {Pointer} pointer - The pointer object
 * @returns {void}
 */
function updatePointerUpData(pointer) {
    pointer.down = false;
}

/**
 * @param {number} delta - The delta X to correct
 * @returns {number} The corrected delta X
 */
function correctDeltaX(delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

/**
 * @param {number} delta - The delta Y to correct
 * @returns {number} The corrected delta Y
 */
function correctDeltaY(delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

/**
 * @param {number} resolution - The resolution to process
 * @returns {{width: number, height: number}} The processed resolution
 */
function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

/**
 * @param {{width: number, height: number}} texture - The texture object
 * @param {number} width - The target width
 * @param {number} height - The target height
 * @returns {{x: number, y: number}} The texture scale
 */
function getTextureScale(texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

/**
 * @param {number} input - The input value to scale
 * @returns {number} The scaled value
 */
function scaleByPixelRatio(input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

/**
 * @param {string} s - The string to hash
 * @returns {number} The hash code
 */
function hashCode(s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}