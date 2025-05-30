'use strict';

import { ColorConfiguration } from './colorConfigurations';

// Import managers for their functionality
import { applyBloom, initBloomFramebuffers, initBloomShaders } from './bloomManager';
import { drawColor as drawBackgroundColor, getRandomColor, initColorShaders, setColorScheme } from './colorManager';
import { applyCurl, applyDivergence, applyGradientSubtract, applyPressure, applyVorticity, initPhysicsShaders } from './physicsManager';
import {
    applyAdvection,
    handlePointerSplat,
    initSplatShaders
} from './splatManager';
import { applySunrays, applySunraysBlur, initSunraysFramebuffers, initSunraysShaders } from './sunraysManager';
import {
    AdvectionProgram,
    BloomPrograms,
    BlurProgram,
    ColorProgram,
    Config,
    CurlFBO,
    DivergenceFBO,
    DoubleFBO,
    DyeFBO,
    FBO,
    FormatResult,
    PhysicsPrograms,
    Pointer,
    RGBColor,
    ShaderUniforms,
    SplatProgram,
    SunraysPrograms,
    VelocityFBO,
    WebGLContext
} from './types';

class PointerPrototype {
    id: number = -1;
    texcoordX: number = 0;
    texcoordY: number = 0;
    prevTexcoordX: number = 0;
    prevTexcoordY: number = 0;
    deltaX: number = 0;
    deltaY: number = 0;
    down: boolean = false;
    moved: boolean = false;
    color: RGBColor;

    constructor() {
        this.color = getColorFromScheme();
    }
}

/** @type {HTMLCanvasElement} */
const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

const config: Config = {
    SIM_RESOLUTION: 512,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 1,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 5,
    SPLAT_RADIUS: 0.01,
    SPLAT_FORCE: 8000,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.4,
    BLOOM_THRESHOLD: 0.0,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 0.3,
    COLOR_SCHEME: 'dusk',
  };

// Use the config defined above
function initColorScheme(scheme: ColorConfiguration = config.COLOR_SCHEME): void {
    setColorScheme(scheme);
}

/**
 * @returns {Color} A random color from the current scheme
 */
function getColorFromScheme(): RGBColor {
    return getRandomColor();
}

// Initialize the default color scheme
initColorScheme();

/** @type {Pointer[]} */
let pointers: Pointer[] = [];
pointers.push(new PointerPrototype());

/** @type {{gl: WebGLRenderingContext, ext: Object}} */
const { gl, ext }: WebGLContext = getWebGLContext(canvas);

let halfFloat: OES_texture_half_float | null;

/**
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @returns {WebGLContext} WebGL context and extensions
 */
function getWebGLContext(canvas: HTMLCanvasElement): WebGLContext {
    const params: WebGLContextAttributes = { 
        alpha: true, 
        depth: false, 
        stencil: false, 
        antialias: false, 
        preserveDrawingBuffer: false 
    };

    const gl2Context = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl2Context;
    let gl: WebGL2RenderingContext | WebGLRenderingContext;
    
    if (isWebGL2 && gl2Context) {
        gl = gl2Context;
    } else {
        const gl1Context = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
        if (!gl1Context) {
            throw new Error('WebGL not supported');
        }
        gl = gl1Context as WebGLRenderingContext;
    }

    let halfFloat: OES_texture_half_float | null = null;
    let supportLinearFiltering: boolean | null = null;
    
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
        if (!supportLinearFiltering) {
            supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
        }
        halfFloat = null;
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        if (!halfFloat) {
            throw new Error('OES_texture_half_float not supported');
        }
        supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    // WebGL2 constants
    const HALF_FLOAT = 0x140B;
    const RGBA16F = 0x881A;
    const RG16F = 0x822F;
    const RG = 0x8227;
    const R16F = 0x822D;
    const RED = 0x1903;

    const halfFloatTexType = isWebGL2 ? HALF_FLOAT : halfFloat!.HALF_FLOAT_OES;
    let formatRGBA = getSupportedFormat(
        gl,
        isWebGL2 ? RGBA16F : gl.RGBA,
        gl.RGBA,
        halfFloatTexType
    );
    let formatRG = getSupportedFormat(
        gl,
        isWebGL2 ? RG16F : gl.RGBA,
        isWebGL2 ? RG : gl.RGBA,
        halfFloatTexType
    );
    let formatR = getSupportedFormat(
        gl,
        isWebGL2 ? R16F : gl.RGBA,
        isWebGL2 ? RED : gl.RGBA,
        halfFloatTexType
    );

    if (!formatRGBA || !formatRG || !formatR) {
        throw new Error('Required texture formats not supported');
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
 * @returns {FormatResult|null} The supported format or null
 */
function getSupportedFormat(
    gl: WebGLRenderingContext,
    internalFormat: number,
    format: number,
    type: number
): FormatResult | null {
    // WebGL2 constants
    const R16F = 0x822D;
    const RG16F = 0x822F;
    const RGBA16F = 0x881A;
    const RG = 0x8227;

    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
        switch (internalFormat) {
            case R16F:
                return getSupportedFormat(gl, RG16F, RG, type);
            case RG16F:
                return getSupportedFormat(gl, RGBA16F, gl.RGBA, type);
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
function supportRenderTextureFormat(
    gl: WebGLRenderingContext,
    internalFormat: number,
    format: number,
    type: number
): boolean {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture!, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status === gl.FRAMEBUFFER_COMPLETE;
}

// Update ShaderUniforms to make all properties optional


class Program<T extends ShaderUniforms = ShaderUniforms> {
    public uniforms: T;
    private program: WebGLProgram;

    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program) as T;
    }

    bind() {
        gl.useProgram(this.program);
    }
}

// Update the Material class to use ShaderUniforms
class Material {
    private vertexShader: WebGLShader;
    private fragmentShaderSource: string;
    private programs: { [key: number]: WebGLProgram };
    private activeProgram: WebGLProgram | null;
    public uniforms: ShaderUniforms;

    constructor(vertexShader: WebGLShader, fragmentShaderSource: string) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = {};
        this.activeProgram = null;
        this.uniforms = {};
    }

    setKeywords(keywords: string[]) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null) {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind() {
        if (this.activeProgram) {
            gl.useProgram(this.activeProgram);
        }
    }
}

/**
 * @param {WebGLShader} vertexShader - The vertex shader
 * @param {WebGLShader} fragmentShader - The fragment shader
 * @returns {WebGLProgram} The created program
 */
function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) {
        throw new Error('Failed to create WebGL program');
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

/**
 * @param {string} source - The shader source code
 * @param {string[]} [keywords] - Optional keywords to add
 * @returns {string} The modified source code
 */
function addKeywords(source: string, keywords?: string[]): string {
    if (!keywords) return source;
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

    return (target: FBO | null, clear = false) => {
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


let dye: DyeFBO;
let velocity: VelocityFBO;
let divergence: DivergenceFBO;
let curl: CurlFBO;
let pressure: DoubleFBO;
let bloom: FBO;
let bloomFramebuffers: FBO[] = [];
let sunrays: FBO;
let sunraysTemp: FBO;

/** @type {{texture: WebGLTexture, width: number, height: number, attach: (id: number) => number}} */
let ditheringTexture: {
    texture: WebGLTexture | null;
    width: number;
    height: number;
    attach: (id: number) => number;
} = createTextureAsync('/src/LDR_LLL1_0.png');

// Initialize physics shaders
const physicsShaders = initPhysicsShaders(gl, baseVertexShader, compileShader);

const pressureProgram = new Program<PhysicsPrograms['pressure']['uniforms']>(baseVertexShader, physicsShaders.pressureShader);
const divergenceProgram = new Program<PhysicsPrograms['divergence']['uniforms']>(baseVertexShader, physicsShaders.divergenceShader);
const curlProgram = new Program<PhysicsPrograms['curl']['uniforms']>(baseVertexShader, physicsShaders.curlShader);
const vorticityProgram = new Program<PhysicsPrograms['vorticity']['uniforms']>(baseVertexShader, physicsShaders.vorticityShader);
const gradienSubtractProgram = new Program<PhysicsPrograms['gradientSubtract']['uniforms']>(baseVertexShader, physicsShaders.gradientSubtractShader);

const sunraysShaders = initSunraysShaders(gl, baseVertexShader, (type, source) => compileShader(type, source));
const sunraysMaskProgram = new Program<SunraysPrograms['sunraysMask']['uniforms']>(baseVertexShader, sunraysShaders.sunraysMaskShader);
const sunraysProgram = new Program<SunraysPrograms['sunrays']['uniforms']>(baseVertexShader, sunraysShaders.sunraysShader);
const blurProgram = new Program<BlurProgram['uniforms']>(baseVertexShader, sunraysShaders.blurShader);

const bloomShaders = initBloomShaders(gl, baseVertexShader, (type, source) => compileShader(type, source));
const bloomPrefilterProgram = new Program<BloomPrograms['bloomPrefilter']['uniforms']>(baseVertexShader, bloomShaders.bloomPrefilterShader);
const bloomBlurProgram = new Program<BloomPrograms['bloomBlur']['uniforms']>(baseVertexShader, bloomShaders.bloomBlurShader);
const bloomFinalProgram = new Program<BloomPrograms['bloomFinal']['uniforms']>(baseVertexShader, bloomShaders.bloomFinalShader);

const splatShaders = initSplatShaders(gl, baseVertexShader, compileShader, ext.supportLinearFiltering);
const splatProgram = new Program<SplatProgram['uniforms']>(baseVertexShader, splatShaders.splatShader);
const advectionProgram = new Program<AdvectionProgram['uniforms']>(baseVertexShader, splatShaders.advectionShader);

const colorShaders = initColorShaders(gl, baseVertexShader, compileShader);
const colorProgram = new Program<ColorProgram['uniforms']>(baseVertexShader, colorShaders.colorShader);

const copyProgram = new Program(baseVertexShader, copyShader);
const clearProgram = new Program(baseVertexShader, clearShader);

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
    
    if (!rgba || !rg || !r) {
        throw new Error('Required texture formats not supported');
    }
    
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null) {
        velocity = {
            ...createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering),
            texelSize: { x: 1.0 / simRes.width, y: 1.0 / simRes.height }
        } as VelocityFBO;
    } else {
        velocity = {
            ...resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering),
            texelSize: { x: 1.0 / simRes.width, y: 1.0 / simRes.height }
        } as VelocityFBO;
    }

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
    }, createFBO, getResolution, {
        halfFloatTexType: texType,
        formatRGBA: rgba,
        supportLinearFiltering: !!ext.supportLinearFiltering
    });

    const { sunrays: newSunrays, temp: newSunraysTemp } = initSunraysFramebuffers(gl, {
        resolution: config.SUNRAYS_RESOLUTION,
        weight: config.SUNRAYS_WEIGHT
    }, createFBO, getResolution, {
        halfFloatTexType: texType,
        formatR: r,
        supportLinearFiltering: !!ext.supportLinearFiltering
    });

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
function createFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number
): FBO {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Failed to create framebuffer');
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const texelSizeX = 1.0 / w;
    const texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach(id: number): number {
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
function createDoubleFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number
): DoubleFBO {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        read: fbo1,
        write: fbo2,
        texture: fbo1.texture,
        fbo: fbo1.fbo,
        attach: (id: number) => fbo1.attach(id),
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
            this.read = fbo1;
            this.write = fbo2;
            this.texture = fbo1.texture;
            this.fbo = fbo1.fbo;
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
function resizeFBO(
    target: FBO,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number
): FBO {
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
function resizeDoubleFBO(
    target: DoubleFBO,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number
): DoubleFBO {
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
function createTextureAsync(url: string) {
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
        attach(id: number) {
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

// Initialize framebuffers
initFramebuffers();

// Initialize display keywords
updateKeywords();

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
            handleSplat(p);
        }
    });
}

/**
 * @param {number} dt - Delta time in seconds
 * @returns {void}
 */
function step(dt: number): void {
    // Disable blending once at the start
    gl.disable(gl.BLEND);

    const programs: PhysicsPrograms = {
        pressure: pressureProgram,
        divergence: divergenceProgram,
        curl: curlProgram,
        vorticity: vorticityProgram,
        gradientSubtract: gradienSubtractProgram
    };

    // Apply curl and vorticity
    applyCurl(gl, velocity, curl, programs, blit);
    applyVorticity(gl, config, dt, velocity, curl, programs, blit);

    // Apply divergence and pressure
    applyDivergence(gl, velocity, divergence, programs, blit);
    
    // Clear pressure
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture!, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value!, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    // Apply pressure and gradient subtraction
    applyPressure(gl, config, pressure, divergence, velocity, programs, blit);
    applyGradientSubtract(gl, pressure, velocity, programs, blit);

    // Apply advection with proper linear filtering support
    const supportLinearFiltering = ext.supportLinearFiltering ?? false;
    
    // Advect velocity
    applyAdvection(
        gl,
        velocity,
        velocity,
        dt,
        config.VELOCITY_DISSIPATION,
        advectionProgram,
        blit,
        supportLinearFiltering
    );

    // Advect dye
    applyAdvection(
        gl,
        velocity,
        dye,
        dt,
        config.DENSITY_DISSIPATION,
        advectionProgram,
        blit,
        supportLinearFiltering
    );
}

/**
 * @param {FBO|null} target - The render target
 * @returns {void}
 */
function render(target: FBO | null): void {
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
        sunrays: sunraysProgram,
        blur: blurProgram
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
function drawDisplay(target: FBO | null): void {
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
function handleSplat(pointer: Pointer): void {
    handlePointerSplat(
        {
            deltaX: pointer.deltaX,
            deltaY: pointer.deltaY,
            texcoordX: pointer.texcoordX,
            texcoordY: pointer.texcoordY,
            prevTexcoordX: pointer.prevTexcoordX,
            prevTexcoordY: pointer.prevTexcoordY,
            color: pointer.color
        },
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
function correctRadius(radius: number): number {
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
        pointer = new PointerPrototype();
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
function updatePointerDownData(pointer: Pointer, id: number, posX: number, posY: number) {
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
function updatePointerMoveData(pointer: Pointer, posX: number, posY: number) {
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
function updatePointerUpData(pointer: Pointer) {
    pointer.down = false;
}

/**
 * @param {number} delta - The delta X to correct
 * @returns {number} The corrected delta X
 */
function correctDeltaX(delta: number) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

/**
 * @param {number} delta - The delta Y to correct
 * @returns {number} The corrected delta Y
 */
function correctDeltaY(delta: number) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

/**
 * @param {number} resolution - The resolution to process
 * @returns {{width: number, height: number}} The processed resolution
 */
function getResolution(resolution: number) {
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
 * Get texture scale based on dimensions
 */
function getTextureScale(texture: { width: number; height: number }, width: number, height: number) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

/**
 * @param {number} input - The input value to scale
 * @returns {number} The scaled value
 */
function scaleByPixelRatio(input: number) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

/**
 * @param {string} s - The string to hash
 * @returns {number} The hash code
 */
function hashCode(s: string) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

/**
 * @param {number} type - The type of shader
 * @param {string} source - The shader source code
 * @param {string[]} [keywords] - Optional keywords to add
 * @returns {WebGLShader} The compiled shader
 */
function compileShader(type: number, source: string, keywords?: string[]): WebGLShader {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error('Failed to create WebGL shader');
    }
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
}

/**
 * Get uniforms from WebGL program
 * @param {WebGLProgram} program - The WebGL program to get uniforms from
 * @returns {Record<string, WebGLUniformLocation>} Object containing uniform locations
 */
function getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation> {
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(program, i)?.name;
        if (uniformName) {
            const location = gl.getUniformLocation(program, uniformName);
            if (location) {
                uniforms[uniformName] = location;
            }
        }
    }
    return uniforms;
}