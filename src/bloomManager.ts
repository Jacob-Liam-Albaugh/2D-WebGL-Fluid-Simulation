// Bloom management utilities using functional programming

// Import shader source code
import {
    bloomBlurShader as bloomBlurShaderSource,
    bloomFinalShader as bloomFinalShaderSource,
    bloomPrefilterShader as bloomPrefilterShaderSource
} from './shaders';
import { BaseFBO, BloomConfig, BloomPrograms } from './types';

// Internal state - only tracking framebuffers
let bloomFramebuffers: BaseFBO[] = [];

/**
 * Initialize bloom shaders
 * @param gl - WebGL context
 * @param baseVertexShader - Base vertex shader
 * @param compileShader - Function to compile shader
 */
export const initBloomShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string) => WebGLShader
): { 
    bloomPrefilterShader: WebGLShader; 
    bloomBlurShader: WebGLShader;
    bloomFinalShader: WebGLShader;
} => {
    const compiledPrefilterShader = compileShader(gl.FRAGMENT_SHADER, bloomPrefilterShaderSource);
    const compiledBlurShader = compileShader(gl.FRAGMENT_SHADER, bloomBlurShaderSource);
    const compiledFinalShader = compileShader(gl.FRAGMENT_SHADER, bloomFinalShaderSource);

    return {
        bloomPrefilterShader: compiledPrefilterShader,
        bloomBlurShader: compiledBlurShader,
        bloomFinalShader: compiledFinalShader
    };
};

/**
 * Initialize bloom framebuffers based on resolution
 * @param gl - WebGL context
 * @param config - Bloom configuration from script.js
 * @param createFBO - Function to create framebuffer object
 * @param getResolution - Function to get resolution
 * @param ext - WebGL extensions
 */
export const initBloomFramebuffers = (
    gl: WebGLRenderingContext,
    config: BloomConfig,
    createFBO: (w: number, h: number, internalFormat: number, format: number, type: number, param: number) => BaseFBO,
    getResolution: (resolution: number) => { width: number; height: number },
    ext: { halfFloatTexType: number; formatRGBA: { internalFormat: number; format: number }; supportLinearFiltering: boolean }
): BaseFBO[] => {
    const res = getResolution(config.resolution);
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    // Create main bloom FBO
    const bloom = createFBO(
        res.width,
        res.height,
        ext.formatRGBA.internalFormat,
        ext.formatRGBA.format,
        ext.halfFloatTexType,
        filtering
    );

    // Reset framebuffers array
    bloomFramebuffers = [];

    // Create mip chain
    for (let i = 0; i < config.iterations; i++) {
        const width = res.width >> (i + 1);
        const height = res.height >> (i + 1);

        if (width < 2 || height < 2) break;

        const fbo = createFBO(
            width,
            height,
            ext.formatRGBA.internalFormat,
            ext.formatRGBA.format,
            ext.halfFloatTexType,
            filtering
        );
        bloomFramebuffers.push(fbo);
    }

    return bloomFramebuffers;
};

/**
 * Apply bloom effect
 * @param gl - WebGL context
 * @param config - Bloom configuration from script.js
 * @param source - Source framebuffer
 * @param destination - Destination framebuffer
 * @param blit - Blit function
 * @param programs - Bloom-related shader programs
 */
export const applyBloom = (
    gl: WebGLRenderingContext,
    config: BloomConfig,
    source: BaseFBO,
    destination: BaseFBO,
    blit: (target: BaseFBO | null) => void,
    programs: BloomPrograms
): void => {
    if (bloomFramebuffers.length < 2) return;

    let last = destination;

    gl.disable(gl.BLEND);
    
    // Prefilter
    programs.bloomPrefilter.bind();
    const knee = config.threshold * config.softKnee + 0.0001;
    const curve0 = config.threshold - knee;
    const curve1 = knee * 2;
    const curve2 = 0.25 / knee;
    gl.uniform3f(programs.bloomPrefilter.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(programs.bloomPrefilter.uniforms.threshold, config.threshold);
    gl.uniform1i(programs.bloomPrefilter.uniforms.uTexture, source.attach(0));
    blit(last);

    // Blur and downscale
    programs.bloomBlur.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        const dest = bloomFramebuffers[i];
        gl.uniform2f(programs.bloomBlur.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(programs.bloomBlur.uniforms.uTexture, last.attach(0));
        blit(dest);
        last = dest;
    }

    // Upscale and blend
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        const baseTex = bloomFramebuffers[i];
        gl.uniform2f(programs.bloomBlur.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(programs.bloomBlur.uniforms.uTexture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        blit(baseTex);
        last = baseTex;
    }

    // Final composite
    gl.disable(gl.BLEND);
    programs.bloomFinal.bind();
    gl.uniform2f(programs.bloomFinal.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(programs.bloomFinal.uniforms.uTexture, last.attach(0));
    gl.uniform1f(programs.bloomFinal.uniforms.intensity, config.intensity);
    blit(destination);
};

/**
 * Get current bloom framebuffers
 */
export const getBloomFramebuffers = (): BaseFBO[] => {
    return [...bloomFramebuffers];
}; 