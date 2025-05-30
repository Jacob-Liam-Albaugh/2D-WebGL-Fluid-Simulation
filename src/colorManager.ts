// Color management utilities using functional programming
import { ColorConfiguration, colorConfigurations } from './colorConfigurations';
import COLOR_SHADER from './shaders/colorShader.glsl';

/**
 * Interface for Program
 */
export interface Program {
    bind: () => void;
    uniforms: {
        color: WebGLUniformLocation;
    };
}

/**
 * Interface for RGB color representation
 */
export interface RGBColor {
    r: number;
    g: number;
    b: number;
}

/**
 * Interface for HSLA color representation
 */
interface HSLAColor {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
    a: number; // 0-1
}

// Internal state for color management
let currentScheme: ColorConfiguration = 'default';
let currentColors: RGBColor[] = [];

/**
 * Parse HSLA color string into HSLAColor object
 * @param hslaStr - HSLA color string (e.g., "hsla(360, 100%, 50%, 1)" or "hsl(360deg, 100%, 50%)")
 */
const parseHSLA = (hslaStr: string): HSLAColor => {
    // Handle both hsl and hsla, with optional deg suffix and flexible spacing
    const matches = hslaStr.match(/hsla?\((\d+)(?:deg)?\s*,?\s*(\d+)%?\s*,?\s*(\d+)%?\s*,?\s*(\d*\.?\d*)?\)/);
    if (!matches) {
        throw new Error(`Invalid HSLA string: ${hslaStr}`);
    }
    return {
        h: parseInt(matches[1], 10),
        s: parseInt(matches[2], 10),
        l: parseInt(matches[3], 10),
        a: matches[4] ? parseFloat(matches[4]) : 1
    };
};

/**
 * Convert HSLA to RGB color
 * @param hsla - HSLA color object or string
 */
const HSLAtoRGB = (hsla: HSLAColor | string): RGBColor => {
    const color = typeof hsla === 'string' ? parseHSLA(hsla) : hsla;
    const h = color.h / 360;
    const s = color.s / 100;
    const l = color.l / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number): number => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return { r, g, b };
};

/**
 * Convert a gradient array of HSLA strings to RGB colors
 * @param gradient - Array of HSLA color strings
 */
const gradientToRGB = (gradient: string[]): RGBColor[] => {
    return gradient.map(HSLAtoRGB);
};

/**
 * Converts HSV color values to RGB
 * @param h - Hue value (0-1)
 * @param s - Saturation value (0-1)
 * @param v - Value/Brightness (0-1)
 * @returns RGB color object
 */
const HSVtoRGB = (h: number, s: number, v: number): RGBColor => {
    const i: number = Math.floor(h * 6);
    const f: number = h * 6 - i;
    const p: number = v * (1 - s);
    const q: number = v * (1 - f * s);
    const t: number = v * (1 - (1 - f) * s);

    const colorMap: [number, number, number][] = [
        [v, t, p],
        [q, v, p],
        [p, v, t],
        [p, q, v],
        [t, p, v],
        [v, p, q]
    ];

    const [r, g, b] = colorMap[i % 6];

    return { r, g, b };
};

/**
 * Set the current color scheme and return the RGB colors
 * @param scheme - Name of the color scheme to use
 * @returns Array of RGB colors for the scheme
 */
export const setColorScheme = (scheme: ColorConfiguration = 'default'): RGBColor[] => {
    if (!colorConfigurations[scheme]) {
        console.warn(`Color scheme "${scheme}" not found, falling back to default`);
        scheme = 'default';
    }
    currentScheme = scheme;
    currentColors = colorConfigurations[scheme].gradient.map(HSLAtoRGB);
    return currentColors;
};

/**
 * Get a random color from the current scheme
 * @returns RGB color object
 */
export const getRandomColor = (): RGBColor => {
    if (currentColors.length === 0) {
        setColorScheme(currentScheme);
    }
    return currentColors[Math.floor(Math.random() * currentColors.length)];
};

/**
 * Generate a random color with reduced intensity
 * @returns RGB color object
 */
export const generateColor = (): RGBColor => {
    const color: RGBColor = HSVtoRGB(Math.random(), 1.0, 1.0);
    const intensity: number = 0.15;
    
    return {
        r: color.r * intensity,
        g: color.g * intensity,
        b: color.b * intensity
    };
};

/**
 * Initialize color shaders
 */
export const initColorShaders = (
    gl: WebGLRenderingContext,
    baseVertexShader: WebGLShader,
    compileShader: (type: number, source: string) => WebGLShader
): { colorShader: WebGLShader } => {
    const colorShader = compileShader(gl.FRAGMENT_SHADER, COLOR_SHADER);
    return { colorShader };
};

/**
 * Draw color
 */
export const drawColor = (
    gl: WebGLRenderingContext,
    target: any,
    color: RGBColor,
    colorProgram: Program,
    blit: (target: any) => void
): void => {
    colorProgram.bind();
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    blit(target);
};

