// Physics and fluid dynamics management utilities using functional programming

// Import shader source code from existing files
import CURL_SHADER from './shaders/curlShader.glsl';
import DIVERGENCE_SHADER from './shaders/divergenceShader.glsl';
import GRADIENT_SUBTRACT_SHADER from './shaders/gradientSubtractShader.glsl';
import PRESSURE_SHADER from './shaders/pressureShader.glsl';
import VORTICITY_SHADER from './shaders/vorticityShader.glsl';

/**
 * Interface for Physics configuration
 */
export interface PhysicsConfig {
    PRESSURE: number;
    PRESSURE_ITERATIONS: number;
    CURL: number;
    VELOCITY_DISSIPATION: number;
    DENSITY_DISSIPATION: number;
}

/**
 * Interface for Single Physics Framebuffer
 */
export interface SinglePhysicsFramebuffer {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach: (id: number) => number;
}

/**
 * Interface for Double Physics Framebuffer
 */
export interface DoublePhysicsFramebuffer {
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    read: SinglePhysicsFramebuffer;
    write: SinglePhysicsFramebuffer;
    swap: () => void;
}

/**
 * Interface for Physics Programs
 */
export interface PhysicsPrograms {
    pressure: {
        bind: () => void;
        uniforms: {
            uPressure: WebGLUniformLocation;
            uDivergence: WebGLUniformLocation;
        }
    };
    divergence: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
        }
    };
    curl: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
        }
    };
    vorticity: {
        bind: () => void;
        uniforms: {
            uVelocity: WebGLUniformLocation;
            uCurl: WebGLUniformLocation;
            curl: WebGLUniformLocation;
            dt: WebGLUniformLocation;
        }
    };
    gradientSubtract: {
        bind: () => void;
        uniforms: {
            uPressure: WebGLUniformLocation;
            uVelocity: WebGLUniformLocation;
        }
    };
}

/**
 * Initialize physics shaders
 */
export const initPhysicsShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string) => WebGLShader
): { 
    pressureShader: WebGLShader;
    divergenceShader: WebGLShader;
    curlShader: WebGLShader;
    vorticityShader: WebGLShader;
    gradientSubtractShader: WebGLShader;
} => {
    const pressureShader = compileShader(gl.FRAGMENT_SHADER, PRESSURE_SHADER);
    const divergenceShader = compileShader(gl.FRAGMENT_SHADER, DIVERGENCE_SHADER);
    const curlShader = compileShader(gl.FRAGMENT_SHADER, CURL_SHADER);
    const vorticityShader = compileShader(gl.FRAGMENT_SHADER, VORTICITY_SHADER);
    const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, GRADIENT_SUBTRACT_SHADER);

    return {
        pressureShader,
        divergenceShader,
        curlShader,
        vorticityShader,
        gradientSubtractShader
    };
};

/**
 * Apply pressure step
 */
export const applyPressure = (
    gl: WebGLRenderingContext,
    config: PhysicsConfig,
    pressure: DoublePhysicsFramebuffer,
    divergence: SinglePhysicsFramebuffer,
    programs: PhysicsPrograms,
    blit: (target: SinglePhysicsFramebuffer | null) => void
): void => {
    gl.disable(gl.BLEND);
    programs.pressure.bind();

    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(programs.pressure.uniforms.uDivergence, divergence.attach(0));
        gl.uniform1i(programs.pressure.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }
};

/**
 * Apply divergence step
 */
export const applyDivergence = (
    gl: WebGLRenderingContext,
    velocity: DoublePhysicsFramebuffer,
    divergence: SinglePhysicsFramebuffer,
    programs: PhysicsPrograms,
    blit: (target: SinglePhysicsFramebuffer | null) => void
): void => {
    gl.disable(gl.BLEND);
    programs.divergence.bind();
    gl.uniform1i(programs.divergence.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);
};

/**
 * Apply curl step
 */
export const applyCurl = (
    gl: WebGLRenderingContext,
    velocity: DoublePhysicsFramebuffer,
    curl: SinglePhysicsFramebuffer,
    programs: PhysicsPrograms,
    blit: (target: SinglePhysicsFramebuffer | null) => void
): void => {
    gl.disable(gl.BLEND);
    programs.curl.bind();
    gl.uniform1i(programs.curl.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);
};

/**
 * Apply vorticity step
 */
export const applyVorticity = (
    gl: WebGLRenderingContext,
    config: PhysicsConfig,
    dt: number,
    velocity: DoublePhysicsFramebuffer,
    curl: SinglePhysicsFramebuffer,
    programs: PhysicsPrograms,
    blit: (target: SinglePhysicsFramebuffer | null) => void
): void => {
    gl.disable(gl.BLEND);
    programs.vorticity.bind();
    gl.uniform1i(programs.vorticity.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(programs.vorticity.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(programs.vorticity.uniforms.curl, config.CURL);
    gl.uniform1f(programs.vorticity.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();
};

/**
 * Apply gradient subtraction step
 */
export const applyGradientSubtract = (
    gl: WebGLRenderingContext,
    pressure: DoublePhysicsFramebuffer,
    velocity: DoublePhysicsFramebuffer,
    programs: PhysicsPrograms,
    blit: (target: SinglePhysicsFramebuffer | null) => void
): void => {
    gl.disable(gl.BLEND);
    programs.gradientSubtract.bind();
    gl.uniform1i(programs.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(programs.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();
}; 