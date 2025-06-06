// Physics and fluid dynamics management utilities using functional programming

// Import shader source code from existing files
import {
    curlShader as curlShaderSource,
    divergenceShader as divergenceShaderSource,
    gradientSubtractShader as gradientSubtractShaderSource,
    pressureShader as pressureShaderSource,
    vorticityShader as vorticityShaderSource
} from './shaders';
import { BaseFBO, DoubleFBO, PhysicsConfig, PhysicsPrograms } from './types';

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
    const compiledPressureShader = compileShader(gl.FRAGMENT_SHADER, pressureShaderSource);
    const compiledDivergenceShader = compileShader(gl.FRAGMENT_SHADER, divergenceShaderSource);
    const compiledCurlShader = compileShader(gl.FRAGMENT_SHADER, curlShaderSource);
    const compiledVorticityShader = compileShader(gl.FRAGMENT_SHADER, vorticityShaderSource);
    const compiledGradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, gradientSubtractShaderSource);

    return {
        pressureShader: compiledPressureShader,
        divergenceShader: compiledDivergenceShader,
        curlShader: compiledCurlShader,
        vorticityShader: compiledVorticityShader,
        gradientSubtractShader: compiledGradientSubtractShader
    };
};

/**
 * Apply pressure step
 */
export const applyPressure = (
    gl: WebGLRenderingContext,
    config: PhysicsConfig,
    pressure: DoubleFBO,
    divergence: BaseFBO,
    velocity: DoubleFBO,
    programs: PhysicsPrograms,
    blit: (target: BaseFBO | null) => void
): void => {
    programs.pressure.bind();
    gl.uniform2f(programs.pressure.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.pressure.uniforms.uDivergence, divergence.attach(0));

    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
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
    velocity: DoubleFBO,
    divergence: BaseFBO,
    programs: PhysicsPrograms,
    blit: (target: BaseFBO | null) => void
): void => {
    programs.divergence.bind();
    gl.uniform2f(programs.divergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.divergence.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);
};

/**
 * Apply curl step
 */
export const applyCurl = (
    gl: WebGLRenderingContext,
    velocity: DoubleFBO,
    curl: BaseFBO,
    programs: PhysicsPrograms,
    blit: (target: BaseFBO | null) => void
): void => {
    programs.curl.bind();
    gl.uniform2f(programs.curl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
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
    velocity: DoubleFBO,
    curl: BaseFBO,
    programs: PhysicsPrograms,
    blit: (target: BaseFBO | null) => void
): void => {
    programs.vorticity.bind();
    gl.uniform2f(programs.vorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
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
    pressure: DoubleFBO,
    velocity: DoubleFBO,
    programs: PhysicsPrograms,
    blit: (target: BaseFBO | null) => void
): void => {
    programs.gradientSubtract.bind();
    gl.uniform2f(programs.gradientSubtract.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(programs.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(programs.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();
}; 