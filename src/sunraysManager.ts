// Sunrays management utilities using functional programming

/**
 * Interface for Sunrays configuration
 */
export interface SunraysConfig {
    resolution: number;
    weight: number;
}

/**
 * Interface for Sunrays Framebuffer
 */
export interface SunraysFramebuffer {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach: (id: number) => number;
}

// Internal state - only tracking framebuffers
let sunraysFramebuffers: {
    sunrays: SunraysFramebuffer | null;
    temp: SunraysFramebuffer | null;
} = {
    sunrays: null,
    temp: null
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
    createFBO: (w: number, h: number, internalFormat: number, format: number, type: number, param: number) => SunraysFramebuffer,
    getResolution: (resolution: number) => { width: number; height: number },
    ext: { halfFloatTexType: number; formatR: { internalFormat: number; format: number }; supportLinearFiltering: boolean }
): { sunrays: SunraysFramebuffer; temp: SunraysFramebuffer } => {
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

    return { ...sunraysFramebuffers } as { sunrays: SunraysFramebuffer; temp: SunraysFramebuffer };
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
    source: SunraysFramebuffer,
    mask: SunraysFramebuffer,
    destination: SunraysFramebuffer,
    blit: (target: SunraysFramebuffer | null) => void,
    programs: {
        sunraysMask: { bind: () => void; uniforms: { uTexture: WebGLUniformLocation } };
        sunrays: { bind: () => void; uniforms: { weight: WebGLUniformLocation; uTexture: WebGLUniformLocation } };
    }
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
export const getSunraysFramebuffers = (): { sunrays: SunraysFramebuffer | null; temp: SunraysFramebuffer | null } => {
    return { ...sunraysFramebuffers };
}; 