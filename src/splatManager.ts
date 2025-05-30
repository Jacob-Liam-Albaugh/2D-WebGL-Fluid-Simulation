// Splat management utilities using functional programming

// Import shader source code
import ADVECTION_SHADER from './shaders/advectionShader.glsl';
import SPLAT_SHADER from './shaders/splatShader.glsl';
import { BaseFBO, DoubleFBO, Pointer, RGBColor, SplatConfig, SplatProgram } from './types';

/**
 * Initialize splat and advection shaders
 */
export const initSplatShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string, keywords?: string[]) => WebGLShader,
    supportLinearFiltering: boolean | null
): { 
    splatShader: WebGLShader;
    advectionShader: WebGLShader;
} => {
    const splatShader = compileShader(gl.FRAGMENT_SHADER, SPLAT_SHADER);
    const advectionShader = compileShader(
        gl.FRAGMENT_SHADER,
        ADVECTION_SHADER,
        supportLinearFiltering ? undefined : ['MANUAL_FILTERING']
    );
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
    color: RGBColor,
    velocity: DoubleFBO,
    dye: DoubleFBO,
    canvas: HTMLCanvasElement,
    splatProgram: SplatProgram,
    blit: (target: BaseFBO | null) => void
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
    velocity: DoubleFBO,
    source: DoubleFBO,
    dt: number,
    dissipation: number,
    advectionProgram: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
            uSource: WebGLUniformLocation;
            texelSize: WebGLUniformLocation;
            dyeTexelSize: WebGLUniformLocation;
            dt: WebGLUniformLocation;
            dissipation: WebGLUniformLocation;
        }
    },
    blit: (target: BaseFBO | null) => void,
    supportLinearFiltering: boolean
): void => {
    gl.disable(gl.BLEND);
    advectionProgram.bind();

    if (!supportLinearFiltering) {
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    }
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    
    // If velocity and source are the same, use the same texture ID
    const velocityId = velocity.read.attach(0);
    if (velocity === source) {
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    } else {
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(advectionProgram.uniforms.uSource, source.read.attach(1));
    }
    
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
        color: RGBColor;
    },
    config: SplatConfig,
    gl: WebGLRenderingContext,
    velocity: DoubleFBO,
    dye: DoubleFBO,
    canvas: HTMLCanvasElement,
    splatProgram: SplatProgram,
    blit: (target: BaseFBO | null) => void
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

/**
 * Create multiple random splats
 */
export const multipleSplats = (
    amount: number,
    config: SplatConfig,
    gl: WebGLRenderingContext,
    velocity: DoubleFBO,
    dye: DoubleFBO,
    canvas: HTMLCanvasElement,
    splatProgram: SplatProgram,
    blit: (target: BaseFBO | null) => void,
    getColorFromScheme: () => RGBColor
): void => {
    for (let i = 0; i < amount; i++) {
        const color = getColorFromScheme();
        color.r *= 10.0;
        color.g *= 10.0;
        color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        const dx = 1000 * (Math.random() - 0.5);
        const dy = 1000 * (Math.random() - 0.5);
        applySplat(
            gl,
            config,
            x,
            y,
            dx,
            dy,
            color,
            velocity,
            dye,
            canvas,
            splatProgram,
            blit
        );
    }
};

/**
 * Update pointer data when moving
 */
export const updatePointerMoveData = (
    pointer: Pointer,
    posX: number,
    posY: number,
    canvas: HTMLCanvasElement
): void => {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX, canvas);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY, canvas);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
};

/**
 * Update pointer data when pressed down
 */
export const updatePointerDownData = (
    pointer: Pointer,
    id: number,
    posX: number,
    posY: number,
    canvas: HTMLCanvasElement,
    getColorFromScheme: () => RGBColor
): void => {
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
};

/**
 * Update pointer data when released
 */
export const updatePointerUpData = (pointer: Pointer): void => {
    pointer.down = false;
};

/**
 * Correct delta X based on aspect ratio
 */
const correctDeltaX = (delta: number, canvas: HTMLCanvasElement): number => {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
};

/**
 * Correct delta Y based on aspect ratio
 */
const correctDeltaY = (delta: number, canvas: HTMLCanvasElement): number => {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}; 