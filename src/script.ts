'use strict';
import { ColorConfiguration } from './colorConfigurations';
import { clearShader, displayShaderSource } from './shaders';

// Import managers for their functionality
import { applyBloom, initBloomFramebuffers, initBloomShaders } from './bloomManager';
import { drawColor as drawBackgroundColor, getRandomColor, initColorShaders, setColorScheme } from './colorManager';
import { applyCurl, applyDivergence, applyGradientSubtract, applyPressure, applyVorticity, initPhysicsShaders } from './physicsManager';
import { PointerManager, } from './pointerManager';
import baseVertexShaderSource from "./shaders/baseVertexShader.glsl";
import copyShaderSource from "./shaders/copyShader.glsl";
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
    RGBColor,
    ShaderUniforms,
    SplatData,
    SplatProgram,
    SunraysPrograms,
    VelocityFBO,
    WebGLContext
} from './types';

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
    CURL: 1,
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

/** @type {{gl: WebGLRenderingContext, ext: Object}} */
const { gl, ext }: WebGLContext = getWebGLContext(canvas);

let halfFloat: OES_texture_half_float | null;

// compile shaders as needed
const baseVertexShaderCompiled = compileShader(gl.VERTEX_SHADER, baseVertexShaderSource);
const copyShaderCompiled = compileShader(gl.FRAGMENT_SHADER, copyShaderSource);
const clearShaderCompiled = compileShader(gl.FRAGMENT_SHADER, clearShader);
const displayShaderCompiled = compileShader(gl.FRAGMENT_SHADER, displayShaderSource);

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
    private fragmentShader: WebGLShader;
    private programs: { [key: number]: WebGLProgram };
    private activeProgram: WebGLProgram | null;
    public uniforms: ShaderUniforms;

    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.programs = {};
        this.activeProgram = null;
        this.uniforms = {};
        
        // Initialize with default program
        const program = createProgram(this.vertexShader, this.fragmentShader);
        this.programs[0] = program;
        this.activeProgram = program;
        this.uniforms = getUniforms(program);
    }

    setKeywords(keywords: string[]) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null) {
            program = createProgram(this.vertexShader, this.fragmentShader);
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
const physicsShaders = initPhysicsShaders(gl, baseVertexShaderCompiled, (type: number, source: string) => compileShader(type, source));

const pressureProgram = new Program<PhysicsPrograms['pressure']['uniforms']>(baseVertexShaderCompiled, physicsShaders.pressureShader);
const divergenceProgram = new Program<PhysicsPrograms['divergence']['uniforms']>(baseVertexShaderCompiled, physicsShaders.divergenceShader);
const curlProgram = new Program<PhysicsPrograms['curl']['uniforms']>(baseVertexShaderCompiled, physicsShaders.curlShader);
const vorticityProgram = new Program<PhysicsPrograms['vorticity']['uniforms']>(baseVertexShaderCompiled, physicsShaders.vorticityShader);
const gradienSubtractProgram = new Program<PhysicsPrograms['gradientSubtract']['uniforms']>(baseVertexShaderCompiled, physicsShaders.gradientSubtractShader);

const sunraysShaders = initSunraysShaders(gl, baseVertexShaderCompiled, (type: number, source: string) => compileShader(type, source));
const sunraysMaskProgram = new Program<SunraysPrograms['sunraysMask']['uniforms']>(baseVertexShaderCompiled, sunraysShaders.sunraysMaskShader);
const sunraysProgram = new Program<SunraysPrograms['sunrays']['uniforms']>(baseVertexShaderCompiled, sunraysShaders.sunraysShader);
const blurProgram = new Program<BlurProgram['uniforms']>(baseVertexShaderCompiled, sunraysShaders.blurShader);

const bloomShaders = initBloomShaders(gl, baseVertexShaderCompiled, (type: number, source: string) => compileShader(type, source));
const bloomPrefilterProgram = new Program<BloomPrograms['bloomPrefilter']['uniforms']>(baseVertexShaderCompiled, bloomShaders.bloomPrefilterShader);
const bloomBlurProgram = new Program<BloomPrograms['bloomBlur']['uniforms']>(baseVertexShaderCompiled, bloomShaders.bloomBlurShader);
const bloomFinalProgram = new Program<BloomPrograms['bloomFinal']['uniforms']>(baseVertexShaderCompiled, bloomShaders.bloomFinalShader);

const splatShaders = initSplatShaders(gl, baseVertexShaderCompiled, (type: number, source: string) => compileShader(type, source), ext.supportLinearFiltering);
const splatProgram = new Program<SplatProgram['uniforms']>(baseVertexShaderCompiled, splatShaders.splatShader);
const advectionProgram = new Program<AdvectionProgram['uniforms']>(baseVertexShaderCompiled, splatShaders.advectionShader);

const colorShaders = initColorShaders(gl, baseVertexShaderCompiled, (type: number, source: string) => compileShader(type, source));
const colorProgram = new Program<ColorProgram['uniforms']>(baseVertexShaderCompiled, colorShaders.colorShader);

const copyProgram = new Program(baseVertexShaderCompiled, copyShaderCompiled);
const clearProgram = new Program(baseVertexShaderCompiled, clearShaderCompiled);

const displayMaterial = new Material(baseVertexShaderCompiled, displayShaderCompiled);

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

// Initialize the pointer manager after WebGL setup
const pointerManager = new PointerManager(
    canvas,
    getColorFromScheme,
    (splatData: SplatData) => handleSplat(splatData)
);

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
    pointerManager.applyInputs();
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

// Update handleSplat function to use SplatData
function handleSplat(splatData: SplatData): void {
    handlePointerSplat(
        splatData,
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