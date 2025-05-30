// Splat management utilities using functional programming

// Import shader source code
import ADVECTION_SHADER from './shaders/advectionShader.glsl';
import SPLAT_SHADER from './shaders/splatShader.glsl';

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
 * Interface for Splat configuration
 */
export interface SplatConfig {
    SPLAT_FORCE: number;
    SPLAT_RADIUS: number;
}

/**
 * Interface for Splat Framebuffer
 */
export interface SplatFramebuffer {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach: (id: number) => number;
    read: SplatFramebuffer;
    write: SplatFramebuffer;
    swap: () => void;
}

/**
 * Interface for Splat Color
 */
export interface SplatColor {
    r: number;
    g: number;
    b: number;
}

/**
 * Initialize splat and advection shaders
 */
export const initSplatShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string) => WebGLShader
): { 
    splatShader: WebGLShader;
    advectionShader: WebGLShader;
} => {
    const splatShader = compileShader(gl.FRAGMENT_SHADER, SPLAT_SHADER);
    const advectionShader = compileShader(gl.FRAGMENT_SHADER, ADVECTION_SHADER);
    return { 
        splatShader,
        advectionShader
    };
};

/**
 * Correct radius based on aspect ratio
 */
const correctRadius = (radius: number, aspectRatio: number): number => {
    if (aspectRatio > 1) {
        radius *= aspectRatio;
    }
    return radius;
};

/**
 * Apply splat effect
 */
export const applySplat = (
    gl: WebGLRenderingContext,
    config: SplatConfig,
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: SplatColor,
    velocity: SplatFramebuffer,
    dye: SplatFramebuffer,
    canvas: HTMLCanvasElement,
    splatProgram: SplatProgram,
    blit: (target: SplatFramebuffer | null) => void
): void => {
    splatProgram.bind();
    
    // Apply to velocity
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(
        splatProgram.uniforms.radius, 
        correctRadius(config.SPLAT_RADIUS / 100.0, canvas.width / canvas.height)
    );
    blit(velocity.write);
    velocity.swap();

    // Apply to dye
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
};

/**
 * Apply advection effect
 */
export const applyAdvection = (
    gl: WebGLRenderingContext,
    velocity: SplatFramebuffer,
    source: SplatFramebuffer,
    dt: number,
    dissipation: number,
    advectionProgram: AdvectionProgram,
    blit: (target: SplatFramebuffer | null) => void,
    supportLinearFiltering: boolean
): void => {
    gl.disable(gl.BLEND);
    advectionProgram.bind();

    if (!supportLinearFiltering) {
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    }
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, source.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, dissipation);
    blit(source.write);
    source.swap();
};

/**
 * Handle pointer splat
 */
export const handlePointerSplat = (
    pointer: {
        deltaX: number;
        deltaY: number;
        texcoordX: number;
        texcoordY: number;
        color: SplatColor;
    },
    config: SplatConfig,
    gl: WebGLRenderingContext,
    velocity: SplatFramebuffer,
    dye: SplatFramebuffer,
    canvas: HTMLCanvasElement,
    splatProgram: SplatProgram,
    blit: (target: SplatFramebuffer | null) => void
): void => {
    const dx = pointer.deltaX * config.SPLAT_FORCE;
    const dy = pointer.deltaY * config.SPLAT_FORCE;
    applySplat(
        gl,
        config,
        pointer.texcoordX,
        pointer.texcoordY,
        dx,
        dy,
        pointer.color,
        velocity,
        dye,
        canvas,
        splatProgram,
        blit
    );
}; 