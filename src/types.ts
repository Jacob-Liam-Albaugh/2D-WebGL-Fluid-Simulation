import { ColorConfiguration } from './colorConfigurations';

// WebGL Types
export interface WebGLContext {
    gl: WebGL2RenderingContext | WebGLRenderingContext;
    ext: {
        formatRGBA: { internalFormat: number; format: number } | null;
        formatRG: { internalFormat: number; format: number } | null;
        formatR: { internalFormat: number; format: number } | null;
        halfFloatTexType: number;
        supportLinearFiltering: boolean | null;
    };
}

// Base Types
export interface Program {
    bind: () => void;
    uniforms: {
        [key: string]: WebGLUniformLocation;
    };
}

// Color Types
export interface RGBColor {
    r: number;
    g: number;
    b: number;
}

export interface HSLAColor {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
    a: number; // 0-1
}

// Framebuffer Types
export interface BaseFBO {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach: (id: number) => number;
}

export interface DoubleFBO extends BaseFBO {
    read: BaseFBO;
    write: BaseFBO;
    swap: () => void;
}

// Bloom Types
export interface BloomConfig {
    iterations: number;
    resolution: number;
    intensity: number;
    threshold: number;
    softKnee: number;
}

export interface BloomPrograms {
    bloomPrefilter: { 
        bind: () => void; 
        uniforms: { 
            curve: WebGLUniformLocation; 
            threshold: WebGLUniformLocation; 
            uTexture: WebGLUniformLocation 
        } 
    };
    bloomBlur: { 
        bind: () => void; 
        uniforms: { 
            texelSize: WebGLUniformLocation; 
            uTexture: WebGLUniformLocation 
        } 
    };
    bloomFinal: { 
        bind: () => void; 
        uniforms: { 
            texelSize: WebGLUniformLocation; 
            uTexture: WebGLUniformLocation; 
            intensity: WebGLUniformLocation 
        } 
    };
}

// Physics Types
export interface PhysicsConfig {
    PRESSURE: number;
    PRESSURE_ITERATIONS: number;
    CURL: number;
    VELOCITY_DISSIPATION: number;
    DENSITY_DISSIPATION: number;
}

export interface PhysicsPrograms {
    pressure: {
        bind: () => void;
        uniforms: {
            uPressure: WebGLUniformLocation;
            uDivergence: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
        };
    };
    divergence: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
        };
    };
    curl: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
        };
    };
    vorticity: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
            uCurl: WebGLUniformLocation;
            curl: WebGLUniformLocation;
            dt: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
        };
    };
    gradientSubtract: {
        bind: () => void;
        uniforms: {
            uPressure: WebGLUniformLocation;
            uVelocity: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
        };
    };
}

// Splat Types
export interface SplatConfig {
    SPLAT_FORCE: number;
    SPLAT_RADIUS: number;
}

/**
 * Interface for Splat Program
 */
export interface SplatProgram {
    bind: () => void;
    uniforms: {
        uTarget: WebGLUniformLocation;
        aspectRatio: WebGLUniformLocation;
        point: WebGLUniformLocation;
        color: WebGLUniformLocation;
        radius: WebGLUniformLocation;
    };
}

export interface Pointer {
    id: number;
    texcoordX: number;
    texcoordY: number;
    prevTexcoordX: number;
    prevTexcoordY: number;
    deltaX: number;
    deltaY: number;
    down: boolean;
    moved: boolean;
    color: RGBColor;
}

// Sunrays Types
export interface SunraysConfig {
    resolution: number;
    weight: number;
}

export interface SunraysPrograms {
    sunraysMask: { 
        bind: () => void; 
        uniforms: { 
            uTexture: WebGLUniformLocation 
        } 
    };
    sunrays: { 
        bind: () => void; 
        uniforms: { 
            weight: WebGLUniformLocation; 
            uTexture: WebGLUniformLocation 
        } 
    };
    blur: {
        bind: () => void;
        uniforms: { 
            texelSize: WebGLUniformLocation; 
            uTexture: WebGLUniformLocation 
        }
    };
}

// Main Config Type
export interface Config {
    SIM_RESOLUTION: number;
    DYE_RESOLUTION: number;
    DENSITY_DISSIPATION: number;
    VELOCITY_DISSIPATION: number;
    PRESSURE: number;
    PRESSURE_ITERATIONS: number;
    CURL: number;
    SPLAT_RADIUS: number;
    SPLAT_FORCE: number;
    BACK_COLOR: RGBColor;
    BLOOM_ITERATIONS: number;
    BLOOM_RESOLUTION: number;
    BLOOM_INTENSITY: number;
    BLOOM_THRESHOLD: number;
    BLOOM_SOFT_KNEE: number;
    SUNRAYS_RESOLUTION: number;
    SUNRAYS_WEIGHT: number;
    COLOR_SCHEME: ColorConfiguration;
}

export  interface WebGL2Constants {
  HALF_FLOAT: 0x140B;
  RGBA16F: 0x881A;
  RG16F: 0x822F;
  RG: 0x8227;
  R16F: 0x822D;
  RED: 0x1903;
}

export interface WebGL2RenderingContext extends WebGLRenderingContext, WebGL2Constants {}

export interface WebGLContext {
  gl: WebGL2RenderingContext | WebGLRenderingContext;
  ext: {
      formatRGBA: { internalFormat: number; format: number } | null;
      formatRG: { internalFormat: number; format: number } | null;
      formatR: { internalFormat: number; format: number } | null;
      halfFloatTexType: number;
      supportLinearFiltering: boolean | null;
  };
}

export interface FormatResult {
    internalFormat: number;
    format: number;
}

export interface ShaderUniforms {
  [key: string]: WebGLUniformLocation;
}


export interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

export interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap: () => void;
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  attach: (id: number) => number;
}

/**
 * Velocity framebuffer - stores fluid velocity field
 * Uses RG texture format where:
 * R channel = horizontal velocity
 * G channel = vertical velocity
 */
export interface VelocityFBO extends DoubleFBO {
  // Inherits all DoubleFBO properties
  // Specific to velocity calculations
  texelSize: { x: number; y: number };
}

/**
 * Divergence framebuffer - stores velocity field divergence
 * Uses R texture format to store scalar divergence values
 */
export interface DivergenceFBO extends FBO {
  // Inherits all FBO properties
  // Single channel (R) texture format
}

/**
 * Curl framebuffer - stores fluid vorticity
 * Uses R texture format to store scalar curl values
 */
export interface CurlFBO extends FBO {
  // Inherits all FBO properties
  // Single channel (R) texture format
}

/**
 * Dye framebuffer - stores fluid color/density
 * Uses RGBA texture format where:
 * RGB channels = color
 * A channel = density
 */
export interface DyeFBO extends DoubleFBO {
  // Inherits all DoubleFBO properties
  // Uses RGBA texture format
}

/**
 * Interface for Advection Program
 */
export interface AdvectionProgram {
    bind: () => void;
    uniforms: {
        uVelocity: WebGLUniformLocation;
        uSource: WebGLUniformLocation;
        texelSize: WebGLUniformLocation;
        dyeTexelSize: WebGLUniformLocation;
        dt: WebGLUniformLocation;
        dissipation: WebGLUniformLocation;
    };
}

/**
 * Interface for Color Program
 */
export interface ColorProgram {
    bind: () => void;
    uniforms: {
        color: WebGLUniformLocation;
    };
}

/**
 * Interface for Blur Program
 */
export interface BlurProgram {
    bind: () => void;
    uniforms: {
        texelSize: WebGLUniformLocation;
        uTexture: WebGLUniformLocation;
    };
}

/**
 * Interface for Sunrays Programs
 */
export interface SunraysPrograms {
    sunraysMask: {
        bind: () => void;
        uniforms: {
            uTexture: WebGLUniformLocation;
        };
    };
    sunrays: {
        bind: () => void;
        uniforms: {
            weight: WebGLUniformLocation;
            uTexture: WebGLUniformLocation;
        };
    };
    blur: BlurProgram;
}
