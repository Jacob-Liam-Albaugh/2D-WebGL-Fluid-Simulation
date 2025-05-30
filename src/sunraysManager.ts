// Sunrays management utilities using functional programming

// Import shader source code
import {
    blurShader as blurShaderSource,
    blurVertexShader as blurVertexShaderSource,
    sunraysMaskShader as sunraysMaskShaderSource,
    sunraysShader as sunraysShaderSource
} from './shaders';
import { BaseFBO, SunraysConfig, SunraysPrograms } from './types';

// Internal state - only tracking framebuffers
let sunraysFramebuffers: {
    sunrays: BaseFBO | null;
    temp: BaseFBO | null;
} = {
    sunrays: null,
    temp: null
};

/**
 * Initialize sunrays shaders
 * @param gl - WebGL context
 * @param baseVertexShader - Base vertex shader
 * @param compileShader - Function to compile shader
 */
export const initSunraysShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string) => WebGLShader
): { 
    sunraysMaskShader: WebGLShader; 
    sunraysShader: WebGLShader;
    blurVertexShader: WebGLShader;
    blurShader: WebGLShader;
} => {
    const compiledSunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, sunraysMaskShaderSource);
    const compiledSunraysShader = compileShader(gl.FRAGMENT_SHADER, sunraysShaderSource);
    const compiledBlurVertexShader = compileShader(gl.VERTEX_SHADER, blurVertexShaderSource);
    const compiledBlurShader = compileShader(gl.FRAGMENT_SHADER, blurShaderSource);

    return {
        sunraysMaskShader: compiledSunraysMaskShader,
        sunraysShader: compiledSunraysShader,
        blurVertexShader: compiledBlurVertexShader,
        blurShader: compiledBlurShader
    };
};

/**
 * Initialize sunrays framebuffers
 * @param gl - WebGL context
 * @param config - Sunrays configuration from script.js
 * @param createFBO - Function to create framebuffer object
 * @param getResolution - Function to get resolution
 * @param ext - WebGL extensions
 */
export const initSunraysFramebuffers = (
    gl: WebGLRenderingContext,
    config: SunraysConfig,
    createFBO: (w: number, h: number, internalFormat: number, format: number, type: number, param: number) => BaseFBO,
    getResolution: (resolution: number) => { width: number; height: number },
    ext: { halfFloatTexType: number; formatR: { internalFormat: number; format: number }; supportLinearFiltering: boolean }
): { sunrays: BaseFBO; temp: BaseFBO } => {
    const res = getResolution(config.resolution);
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunraysFramebuffers.sunrays = createFBO(
        res.width,
        res.height,
        ext.formatR.internalFormat,
        ext.formatR.format,
        ext.halfFloatTexType,
        filtering
    );

    sunraysFramebuffers.temp = createFBO(
        res.width,
        res.height,
        ext.formatR.internalFormat,
        ext.formatR.format,
        ext.halfFloatTexType,
        filtering
    );

    return { ...sunraysFramebuffers } as { sunrays: BaseFBO; temp: BaseFBO };
};

/**
 * Apply sunrays effect
 * @param gl - WebGL context
 * @param config - Sunrays configuration from script.js
 * @param source - Source framebuffer
 * @param mask - Mask framebuffer
 * @param destination - Destination framebuffer
 * @param blit - Blit function
 * @param programs - Sunrays-related shader programs
 */
export const applySunrays = (
    gl: WebGLRenderingContext,
    config: SunraysConfig,
    source: BaseFBO,
    mask: BaseFBO,
    destination: BaseFBO,
    blit: (target: BaseFBO | null) => void,
    programs: SunraysPrograms
): void => {
    gl.disable(gl.BLEND);

    // Apply mask
    programs.sunraysMask.bind();
    gl.uniform1i(programs.sunraysMask.uniforms.uTexture, source.attach(0));
    blit(mask);

    // Apply sunrays
    programs.sunrays.bind();
    gl.uniform1f(programs.sunrays.uniforms.weight, config.weight);
    gl.uniform1i(programs.sunrays.uniforms.uTexture, mask.attach(0));
    blit(destination);
};

/**
 * Get current sunrays framebuffers
 */
export const getSunraysFramebuffers = (): { sunrays: BaseFBO | null; temp: BaseFBO | null } => {
    return { ...sunraysFramebuffers };
};

/**
 * Apply blur effect to sunrays
 * @param gl - WebGL context
 * @param target - Target framebuffer
 * @param temp - Temporary framebuffer
 * @param iterations - Number of blur iterations
 * @param blurProgram - Blur shader program
 * @param blit - Blit function
 */
export const applySunraysBlur = (
    gl: WebGLRenderingContext,
    target: BaseFBO,
    temp: BaseFBO,
    iterations: number,
    blurProgram: { bind: () => void; uniforms: { texelSize: WebGLUniformLocation; uTexture: WebGLUniformLocation } },
    blit: (target: BaseFBO | null) => void
): void => {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
        gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
        gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
        blit(temp);

        gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
        gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
        blit(target);
    }
}; 