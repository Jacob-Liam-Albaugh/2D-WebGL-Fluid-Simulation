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
    PhysicsPrograms,
    ShaderUniforms,
    SplatData,
    SplatProgram,
    SunraysPrograms,
    VelocityFBO,
    WebGLContext
} from './types';

export class FluidRenderer {
    private gl: WebGLRenderingContext;
    private ext: {
        formatRGBA: { internalFormat: number; format: number } | null;
        formatRG: { internalFormat: number; format: number } | null;
        formatR: { internalFormat: number; format: number } | null;
        halfFloatTexType: number;
        supportLinearFiltering: boolean;
    };
    private config: Config;
    private canvas: HTMLCanvasElement;
    private pointerManager: PointerManager;
    private lastUpdateTime: number;
    private animationFrameId: number | null = null;

    // FBOs
    private dye!: DyeFBO;
    private velocity!: VelocityFBO;
    private divergence!: DivergenceFBO;
    private curl!: CurlFBO;
    private pressure!: DoubleFBO;
    private bloom!: FBO;
    private bloomFramebuffers: FBO[] = [];
    private sunrays!: FBO;
    private sunraysTemp!: FBO;

    // Programs
    private displayMaterial!: Material;
    private pressureProgram!: Program<PhysicsPrograms['pressure']['uniforms']>;
    private divergenceProgram!: Program<PhysicsPrograms['divergence']['uniforms']>;
    private curlProgram!: Program<PhysicsPrograms['curl']['uniforms']>;
    private vorticityProgram!: Program<PhysicsPrograms['vorticity']['uniforms']>;
    private gradienSubtractProgram!: Program<PhysicsPrograms['gradientSubtract']['uniforms']>;
    private sunraysMaskProgram!: Program<SunraysPrograms['sunraysMask']['uniforms']>;
    private sunraysProgram!: Program<SunraysPrograms['sunrays']['uniforms']>;
    private blurProgram!: Program<BlurProgram['uniforms']>;
    private bloomPrefilterProgram!: Program<BloomPrograms['bloomPrefilter']['uniforms']>;
    private bloomBlurProgram!: Program<BloomPrograms['bloomBlur']['uniforms']>;
    private bloomFinalProgram!: Program<BloomPrograms['bloomFinal']['uniforms']>;
    private splatProgram!: Program<SplatProgram['uniforms']>;
    private advectionProgram!: Program<AdvectionProgram['uniforms']>;
    private colorProgram!: Program<ColorProgram['uniforms']>;
    private copyProgram!: Program;
    private clearProgram!: Program;

    private ditheringTexture: {
        texture: WebGLTexture | null;
        width: number;
        height: number;
        attach: (id: number) => number;
    };

    constructor(canvas: HTMLCanvasElement, config?: Partial<Config>) {
        this.canvas = canvas;
        this.config = {
            SIM_RESOLUTION: 512,
            DYE_RESOLUTION: 1024,
            DENSITY_DISSIPATION: 2.5,
            VELOCITY_DISSIPATION: 0.9,
            PRESSURE: 0.8,
            PRESSURE_ITERATIONS: 20,
            CURL: 0.1,
            SPLAT_RADIUS: 0.0003,
            SPLAT_FORCE: 8000,
            BACK_COLOR: { r: 0, g: 0, b: 0 },
            BLOOM_ITERATIONS: 10,
            BLOOM_RESOLUTION: 256,
            BLOOM_INTENSITY: 0.15,
            BLOOM_THRESHOLD: 0.0,
            BLOOM_SOFT_KNEE: 0.7,
            SUNRAYS_RESOLUTION: 256,
            SUNRAYS_WEIGHT: 0.1,
            COLOR_SCHEME: 'dusk',
            DUFFING: {
                NUM_OSCILLATORS: 8,
                DELTA: 0.2,
                BETA: 0.08,
                ALPHA: 0.9,
                GAMMA: 0.8,
                OMEGA: 0.4
            },
            ...config
        };

        const { gl, ext } = this.getWebGLContext(canvas);
        this.gl = gl;
        this.ext = ext;

        // Initialize vertex buffer and element array buffer
        const vertices = new Float32Array([
            -1, -1, // bottom left
            1, -1,  // bottom right
            -1, 1,  // top left
            1, 1    // top right
        ]);
        
        const indices = new Uint16Array([
            0, 1, 2,    // first triangle
            2, 1, 3     // second triangle
        ]);

        // Create and bind vertex array object (VAO)
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Create and bind element array buffer
        const elementBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        // Enable vertex attributes
        const vertexPosition = 0; // attribute location 0
        gl.enableVertexAttribArray(vertexPosition);
        gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);

        // Initialize color scheme
        this.initColorScheme();

        // Compile base shaders
        const baseVertexShader = this.compileShader(gl.VERTEX_SHADER, baseVertexShaderSource);
        const copyShader = this.compileShader(gl.FRAGMENT_SHADER, copyShaderSource);
        const clearShaderCompiled = this.compileShader(gl.FRAGMENT_SHADER, clearShader);
        const displayShader = this.compileShader(gl.FRAGMENT_SHADER, displayShaderSource);

        // Initialize all programs
        this.initPrograms(baseVertexShader, copyShader, clearShaderCompiled, displayShader);

        // Initialize framebuffers
        this.initFramebuffers();

        // Initialize display keywords
        this.updateKeywords();

        // Initialize pointer manager
        this.pointerManager = new PointerManager(
            canvas,
            () => getRandomColor(),
            (splatData: SplatData) => this.handleSplat(splatData),
            this.config
        );

        this.lastUpdateTime = Date.now();
        this.ditheringTexture = this.createTextureAsync('/src/LDR_LLL1_0.png');

        // Start the animation loop
        this.update();
    }

    private initPrograms(baseVertexShader: WebGLShader, copyShader: WebGLShader, clearShader: WebGLShader, displayShader: WebGLShader) {
        const physicsShaders = initPhysicsShaders(this.gl, baseVertexShader, (type, source) => this.compileShader(type, source));
        const sunraysShaders = initSunraysShaders(this.gl, baseVertexShader, (type, source) => this.compileShader(type, source));
        const bloomShaders = initBloomShaders(this.gl, baseVertexShader, (type, source) => this.compileShader(type, source));
        const splatShaders = initSplatShaders(this.gl, baseVertexShader, (type, source) => this.compileShader(type, source), this.ext.supportLinearFiltering);
        const colorShaders = initColorShaders(this.gl, baseVertexShader, (type, source) => this.compileShader(type, source));

        this.pressureProgram = new Program(this.gl, baseVertexShader, physicsShaders.pressureShader);
        this.divergenceProgram = new Program(this.gl, baseVertexShader, physicsShaders.divergenceShader);
        this.curlProgram = new Program(this.gl, baseVertexShader, physicsShaders.curlShader);
        this.vorticityProgram = new Program(this.gl, baseVertexShader, physicsShaders.vorticityShader);
        this.gradienSubtractProgram = new Program(this.gl, baseVertexShader, physicsShaders.gradientSubtractShader);
        
        this.sunraysMaskProgram = new Program(this.gl, baseVertexShader, sunraysShaders.sunraysMaskShader);
        this.sunraysProgram = new Program(this.gl, baseVertexShader, sunraysShaders.sunraysShader);
        this.blurProgram = new Program(this.gl, baseVertexShader, sunraysShaders.blurShader);
        
        this.bloomPrefilterProgram = new Program(this.gl, baseVertexShader, bloomShaders.bloomPrefilterShader);
        this.bloomBlurProgram = new Program(this.gl, baseVertexShader, bloomShaders.bloomBlurShader);
        this.bloomFinalProgram = new Program(this.gl, baseVertexShader, bloomShaders.bloomFinalShader);
        
        this.splatProgram = new Program(this.gl, baseVertexShader, splatShaders.splatShader);
        this.advectionProgram = new Program(this.gl, baseVertexShader, splatShaders.advectionShader);
        
        this.colorProgram = new Program(this.gl, baseVertexShader, colorShaders.colorShader);
        this.copyProgram = new Program(this.gl, baseVertexShader, copyShader);
        this.clearProgram = new Program(this.gl, baseVertexShader, clearShader);
        this.displayMaterial = new Material(this.gl, baseVertexShader, displayShader);
    }

    private initColorScheme(scheme: ColorConfiguration = this.config.COLOR_SCHEME) {
        setColorScheme(scheme);
    }

    private update = () => {
        const dt = this.calcDeltaTime();
        if (this.resizeCanvas())
            this.initFramebuffers();
        this.applyInputs();
        this.step(dt);
        this.render(null);
        this.animationFrameId = requestAnimationFrame(this.update);
    }

    private calcDeltaTime(): number {
        const now = Date.now();
        const dt = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        return Math.min(dt, 0.016666);
    }

    private resizeCanvas(): boolean {
        const width = this.scaleByPixelRatio(this.canvas.clientWidth);
        const height = this.scaleByPixelRatio(this.canvas.clientHeight);
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            return true;
        }
        return false;
    }

    private applyInputs() {
        this.pointerManager.applyInputs();
    }

    private step(dt: number) {
        this.gl.disable(this.gl.BLEND);

        const programs: PhysicsPrograms = {
            pressure: this.pressureProgram,
            divergence: this.divergenceProgram,
            curl: this.curlProgram,
            vorticity: this.vorticityProgram,
            gradientSubtract: this.gradienSubtractProgram
        };

        applyCurl(this.gl, this.velocity, this.curl, programs, this.blit);
        applyVorticity(this.gl, this.config, dt, this.velocity, this.curl, programs, this.blit);
        applyDivergence(this.gl, this.velocity, this.divergence, programs, this.blit);

        this.clearProgram.bind();
        this.gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
        this.gl.uniform1f(this.clearProgram.uniforms.value, this.config.PRESSURE);
        this.blit(this.pressure.write);
        this.pressure.swap();

        applyPressure(this.gl, this.config, this.pressure, this.divergence, this.velocity, programs, this.blit);
        applyGradientSubtract(this.gl, this.pressure, this.velocity, programs, this.blit);

        applyAdvection(
            this.gl,
            this.velocity,
            this.velocity,
            dt,
            this.config.VELOCITY_DISSIPATION,
            this.advectionProgram,
            this.blit,
            this.ext.supportLinearFiltering
        );

        applyAdvection(
            this.gl,
            this.velocity,
            this.dye,
            dt,
            this.config.DENSITY_DISSIPATION,
            this.advectionProgram,
            this.blit,
            this.ext.supportLinearFiltering
        );
    }

    private render(target: FBO | null) {
        applyBloom(this.gl, {
            iterations: this.config.BLOOM_ITERATIONS,
            resolution: this.config.BLOOM_RESOLUTION,
            intensity: this.config.BLOOM_INTENSITY,
            threshold: this.config.BLOOM_THRESHOLD,
            softKnee: this.config.BLOOM_SOFT_KNEE
        }, this.dye.read, this.bloom, this.blit, {
            bloomPrefilter: this.bloomPrefilterProgram,
            bloomBlur: this.bloomBlurProgram,
            bloomFinal: this.bloomFinalProgram
        });

        applySunrays(this.gl, {
            resolution: this.config.SUNRAYS_RESOLUTION,
            weight: this.config.SUNRAYS_WEIGHT
        }, this.dye.read, this.dye.write, this.sunrays, this.blit, {
            sunraysMask: this.sunraysMaskProgram,
            sunrays: this.sunraysProgram,
            blur: this.blurProgram
        });

        applySunraysBlur(this.gl, this.sunrays, this.sunraysTemp, 1, this.blurProgram, this.blit);

        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.enable(this.gl.BLEND);

        drawBackgroundColor(this.gl, target, this.config.BACK_COLOR, this.colorProgram, this.blit);
        this.drawDisplay(target);
    }

    private drawDisplay(target: FBO | null) {
        const width = target == null ? this.gl.drawingBufferWidth : target.width;
        const height = target == null ? this.gl.drawingBufferHeight : target.height;

        this.displayMaterial.bind();
        this.gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
        this.gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.dye.read.attach(0));
        this.gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.bloom.attach(1));
        this.gl.uniform1i(this.displayMaterial.uniforms.uDithering, this.ditheringTexture.attach(2));
        const scale = this.getTextureScale(this.ditheringTexture, width, height);
        this.gl.uniform2f(this.displayMaterial.uniforms.ditherScale, scale.x, scale.y);
        this.gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.sunrays.attach(3));
        this.blit(target);
    }

    private handleSplat(splatData: SplatData) {
        handlePointerSplat(
            splatData,
            {
                SPLAT_FORCE: this.config.SPLAT_FORCE,
                SPLAT_RADIUS: this.config.SPLAT_RADIUS
            },
            this.gl,
            this.velocity,
            this.dye,
            this.canvas,
            this.splatProgram,
            this.blit
        );
    }

    public updateConfig(newConfig: Partial<Config>) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.COLOR_SCHEME) {
            this.initColorScheme(newConfig.COLOR_SCHEME);
        }
    }

    public destroy() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Disable vertex attributes
        this.gl.disableVertexAttribArray(0);
        
        // Delete buffers
        const vertexBuffer = this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING);
        const elementBuffer = this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING);
        if (vertexBuffer) this.gl.deleteBuffer(vertexBuffer);
        if (elementBuffer) this.gl.deleteBuffer(elementBuffer);
        
        // Clean up WebGL resources
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }

    private getWebGLContext(canvas: HTMLCanvasElement): WebGLContext {
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
        let supportLinearFiltering = false;
        
        if (isWebGL2) {
            gl.getExtension('EXT_color_buffer_float');
            supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
            if (!supportLinearFiltering) {
                supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
            }
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
        let formatRGBA = this.getSupportedFormat(
            gl,
            isWebGL2 ? RGBA16F : gl.RGBA,
            gl.RGBA,
            halfFloatTexType
        );
        let formatRG = this.getSupportedFormat(
            gl,
            isWebGL2 ? RG16F : gl.RGBA,
            isWebGL2 ? RG : gl.RGBA,
            halfFloatTexType
        );
        let formatR = this.getSupportedFormat(
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

    private getSupportedFormat(
        gl: WebGLRenderingContext,
        internalFormat: number,
        format: number,
        type: number
    ): { internalFormat: number; format: number } | null {
        if (!this.supportRenderTextureFormat(gl, internalFormat, format, type)) {
            switch (internalFormat) {
                case 0x822D: // R16F
                    return this.getSupportedFormat(gl, 0x822F, 0x8227, type); // RG16F, RG
                case 0x822F: // RG16F
                    return this.getSupportedFormat(gl, 0x881A, gl.RGBA, type); // RGBA16F, RGBA
                default:
                    return null;
            }
        }

        return {
            internalFormat,
            format
        };
    }

    private supportRenderTextureFormat(
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

    private compileShader(type: number, source: string, keywords?: string[]): WebGLShader {
        source = this.addKeywords(source, keywords);

        const shader = this.gl.createShader(type);
        if (!shader) {
            throw new Error('Failed to create WebGL shader');
        }
        
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
            console.trace(this.gl.getShaderInfoLog(shader));

        return shader;
    }

    private addKeywords(source: string, keywords?: string[]): string {
        if (!keywords) return source;
        let keywordsString = '';
        keywords.forEach(keyword => {
            keywordsString += '#define ' + keyword + '\n';
        });
        return keywordsString + source;
    }

    private blit = (target: FBO | null, clear = false) => {
        if (target == null) {
            this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        } else {
            this.gl.viewport(0, 0, target.width, target.height);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.fbo);
        }
        if (clear) {
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        // Ensure vertex attributes are enabled
        this.gl.enableVertexAttribArray(0);
        this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    }

    private createTextureAsync(url: string) {
        let texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, 1, 1, 0, this.gl.RGB, this.gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

        let obj = {
            texture,
            width: 1,
            height: 1,
            attach: (id: number) => {
                this.gl.activeTexture(this.gl.TEXTURE0 + id);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                return id;
            }
        };

        let image = new Image();
        image.onload = () => {
            obj.width = image.width;
            obj.height = image.height;
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, image);
        };
        image.src = url;

        return obj;
    }

    private getResolution(resolution: number) {
        let aspectRatio = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
        if (aspectRatio < 1)
            aspectRatio = 1.0 / aspectRatio;

        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);

        if (this.gl.drawingBufferWidth > this.gl.drawingBufferHeight)
            return { width: max, height: min };
        else
            return { width: min, height: max };
    }

    private getTextureScale(texture: { width: number; height: number }, width: number, height: number) {
        return {
            x: width / texture.width,
            y: height / texture.height
        };
    }

    private scaleByPixelRatio(input: number) {
        let pixelRatio = window.devicePixelRatio || 1;
        return Math.floor(input * pixelRatio);
    }

    private updateKeywords() {
        let displayKeywords = [];
        displayKeywords.push("SHADING");
        displayKeywords.push("BLOOM");
        displayKeywords.push("SUNRAYS");
        this.displayMaterial.setKeywords(displayKeywords);
    }

    private initFramebuffers() {
        let simRes = this.getResolution(this.config.SIM_RESOLUTION);
        let dyeRes = this.getResolution(this.config.DYE_RESOLUTION);

        const texType = this.ext.halfFloatTexType;
        const rgba = this.ext.formatRGBA;
        const rg = this.ext.formatRG;
        const r = this.ext.formatR;
        
        if (!rgba || !rg || !r) {
            throw new Error('Required texture formats not supported');
        }
        
        const filtering = this.ext.supportLinearFiltering ? this.gl.LINEAR : this.gl.NEAREST;

        this.gl.disable(this.gl.BLEND);

        if (!this.dye)
            this.dye = this.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        else
            this.dye = this.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

        if (!this.velocity) {
            this.velocity = {
                ...this.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering),
                texelSize: { x: 1.0 / simRes.width, y: 1.0 / simRes.height }
            } as VelocityFBO;
        } else {
            this.velocity = {
                ...this.resizeDoubleFBO(this.velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering),
                texelSize: { x: 1.0 / simRes.width, y: 1.0 / simRes.height }
            } as VelocityFBO;
        }

        this.divergence = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, this.gl.NEAREST);
        this.curl = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, this.gl.NEAREST);
        this.pressure = this.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, this.gl.NEAREST);

        this.bloom = this.createFBO(simRes.width, simRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        this.bloomFramebuffers = initBloomFramebuffers(this.gl, {
            iterations: this.config.BLOOM_ITERATIONS,
            resolution: this.config.BLOOM_RESOLUTION,
            intensity: this.config.BLOOM_INTENSITY,
            threshold: this.config.BLOOM_THRESHOLD,
            softKnee: this.config.BLOOM_SOFT_KNEE
        }, (w, h, internalFormat, format, type, param) => this.createFBO(w, h, internalFormat, format, type, param), 
        (resolution) => this.getResolution(resolution), {
            halfFloatTexType: texType,
            formatRGBA: rgba,
            supportLinearFiltering: this.ext.supportLinearFiltering
        });

        const { sunrays: newSunrays, temp: newSunraysTemp } = initSunraysFramebuffers(this.gl, {
            resolution: this.config.SUNRAYS_RESOLUTION,
            weight: this.config.SUNRAYS_WEIGHT
        }, (w, h, internalFormat, format, type, param) => this.createFBO(w, h, internalFormat, format, type, param),
        (resolution) => this.getResolution(resolution), {
            halfFloatTexType: texType,
            formatR: r,
            supportLinearFiltering: this.ext.supportLinearFiltering
        });

        this.sunrays = newSunrays;
        this.sunraysTemp = newSunraysTemp;
    }

    private createFBO(
        w: number,
        h: number,
        internalFormat: number,
        format: number,
        type: number,
        param: number
    ): FBO {
        this.gl.activeTexture(this.gl.TEXTURE0);
        const texture = this.gl.createTexture();
        if (!texture) throw new Error('Failed to create texture');
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, param);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, param);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

        const fbo = this.gl.createFramebuffer();
        if (!fbo) throw new Error('Failed to create framebuffer');
        
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);
        this.gl.viewport(0, 0, w, h);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        const texelSizeX = 1.0 / w;
        const texelSizeY = 1.0 / h;

        return {
            texture,
            fbo,
            width: w,
            height: h,
            texelSizeX,
            texelSizeY,
            attach: (id: number): number => {
                this.gl.activeTexture(this.gl.TEXTURE0 + id);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                return id;
            }
        };
    }

    private createDoubleFBO(
        w: number,
        h: number,
        internalFormat: number,
        format: number,
        type: number,
        param: number
    ): DoubleFBO {
        let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
        let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);

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

    private resizeFBO(
        target: FBO,
        w: number,
        h: number,
        internalFormat: number,
        format: number,
        type: number,
        param: number
    ): FBO {
        let newFBO = this.createFBO(w, h, internalFormat, format, type, param);
        this.copyProgram.bind();
        this.gl.uniform1i(this.copyProgram.uniforms.uTexture, target.attach(0));
        this.blit(newFBO);
        return newFBO;
    }

    private resizeDoubleFBO(
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
        target.read = this.resizeFBO(target.read, w, h, internalFormat, format, type, param);
        target.write = this.createFBO(w, h, internalFormat, format, type, param);
        target.width = w;
        target.height = h;
        target.texelSizeX = 1.0 / w;
        target.texelSizeY = 1.0 / h;
        return target;
    }
}

class Program<T extends ShaderUniforms = ShaderUniforms> {
    public uniforms: T;
    private program: WebGLProgram;
    private gl: WebGLRenderingContext;

    constructor(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
        this.gl = gl;
        this.program = this.createProgram(vertexShader, fragmentShader);
        this.uniforms = this.getUniforms(this.program) as T;
    }

    bind() {
        this.gl.useProgram(this.program);
    }

    private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
        const program = this.gl.createProgram();
        if (!program) {
            throw new Error('Failed to create WebGL program');
        }
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
            console.trace(this.gl.getProgramInfoLog(program));

        return program;
    }

    private getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation> {
        const uniforms: Record<string, WebGLUniformLocation> = {};
        const uniformCount = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = this.gl.getActiveUniform(program, i)?.name;
            if (uniformName) {
                const location = this.gl.getUniformLocation(program, uniformName);
                if (location) {
                    uniforms[uniformName] = location;
                }
            }
        }
        return uniforms;
    }
}

class Material {
    private vertexShader: WebGLShader;
    private fragmentShader: WebGLShader;
    private programs: { [key: number]: WebGLProgram };
    private activeProgram: WebGLProgram | null;
    private gl: WebGLRenderingContext;
    public uniforms: ShaderUniforms;

    constructor(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
        this.gl = gl;
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.programs = {};
        this.activeProgram = null;
        this.uniforms = {};
        
        const program = this.createProgram(this.vertexShader, this.fragmentShader);
        this.programs[0] = program;
        this.activeProgram = program;
        this.uniforms = this.getUniforms(program);
    }

    setKeywords(keywords: string[]) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += this.hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null) {
            program = this.createProgram(this.vertexShader, this.fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = this.getUniforms(program);
        this.activeProgram = program;
    }

    bind() {
        if (this.activeProgram) {
            this.gl.useProgram(this.activeProgram);
        }
    }

    private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
        const program = this.gl.createProgram();
        if (!program) {
            throw new Error('Failed to create WebGL program');
        }
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
            console.trace(this.gl.getProgramInfoLog(program));

        return program;
    }

    private getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation> {
        const uniforms: Record<string, WebGLUniformLocation> = {};
        const uniformCount = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = this.gl.getActiveUniform(program, i)?.name;
            if (uniformName) {
                const location = this.gl.getUniformLocation(program, uniformName);
                if (location) {
                    uniforms[uniformName] = location;
                }
            }
        }
        return uniforms;
    }

    private hashCode(s: string): number {
        if (s.length == 0) return 0;
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
            hash = (hash << 5) - hash + s.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
}