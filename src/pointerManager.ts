import { DuffingOscillator } from './DuffingOscillator';
import { Config, PointerData, RGBColor, SplatData } from './types';

export class PointerManager {
    private pointers: PointerData[] = [];
    private canvas: HTMLCanvasElement;
    private getColorCallback: () => RGBColor;
    private onSplatCallback: (splatData: SplatData) => void;
    private oscillators: DuffingOscillator[];
    private lastTime: number;
    private animationFrameId: number | null = null;
    private fixedColors: RGBColor[];

    constructor(
        canvas: HTMLCanvasElement, 
        getColorCallback: () => RGBColor,
        onSplatCallback: (splatData: SplatData) => void,
        config: Config
    ) {
        this.canvas = canvas;
        this.getColorCallback = getColorCallback;
        this.onSplatCallback = onSplatCallback;
        
        // Pre-generate fixed colors for each oscillator
        this.fixedColors = Array.from(
            { length: config.DUFFING.NUM_OSCILLATORS }, 
            () => this.getColorCallback()
        );
        
        // Create multiple oscillators with different parameters
        this.oscillators = Array.from({ length: config.DUFFING.NUM_OSCILLATORS }, (_, i) => {
            return new DuffingOscillator({
                delta: config.DUFFING.DELTA,
                beta: config.DUFFING.BETA,
                alpha: config.DUFFING.ALPHA,
                gamma: config.DUFFING.GAMMA,
                omega: config.DUFFING.OMEGA,
                index: i,
                total: config.DUFFING.NUM_OSCILLATORS
            });
        });
        
        // Create a pointer for each oscillator with its fixed color
        this.pointers = this.oscillators.map((_, i) => this.createPointer(i));
        
        this.lastTime = performance.now();
        this.startAnimation();
    }

    private createPointer(index: number): PointerData {
        return {
            id: -1,
            texcoordX: 0.5,
            texcoordY: 0.5,
            prevTexcoordX: 0.5,
            prevTexcoordY: 0.5,
            deltaX: 0,
            deltaY: 0,
            down: true,
            moved: false,
            color: this.fixedColors[index]
        };
    }

    private scaleByPixelRatio(input: number): number {
        const pixelRatio = window.devicePixelRatio || 1;
        return Math.floor(input * pixelRatio);
    }

    private correctDeltaX(delta: number): number {
        const aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }

    private correctDeltaY(delta: number): number {
        const aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }

    private startAnimation(): void {
        const animate = () => {
            const currentTime = performance.now();
            const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.016666);
            this.lastTime = currentTime;

            // Update each oscillator and generate splats
            this.oscillators.forEach((oscillator, index) => {
                const { x, y, dx, dy } = oscillator.update(deltaTime);
                const pointer = this.pointers[index];

                pointer.prevTexcoordX = pointer.texcoordX;
                pointer.prevTexcoordY = pointer.texcoordY;
                
                // Map to canvas space with offset from center
                pointer.texcoordX = Math.min(Math.max(x + 0.5, 0), 1);
                pointer.texcoordY = Math.min(Math.max(y + 0.5, 0), 1);
                
                pointer.deltaX = this.correctDeltaX(dx * 0.5);
                pointer.deltaY = this.correctDeltaY(dy * 0.5);
                pointer.moved = true;

                // Generate splat with fixed color
                this.onSplatCallback({
                    texcoordX: pointer.texcoordX,
                    texcoordY: pointer.texcoordY,
                    prevTexcoordX: pointer.prevTexcoordX,
                    prevTexcoordY: pointer.prevTexcoordY,
                    deltaX: pointer.deltaX,
                    deltaY: pointer.deltaY,
                    color: this.fixedColors[index]
                });
            });

            this.animationFrameId = requestAnimationFrame(animate);
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    public stopAnimation(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    public generateSplat(posX: number, posY: number, color?: RGBColor): void {
        const pointer = this.createPointer(0); // Use first color for manual splats
        const scaledPosX = this.scaleByPixelRatio(posX);
        const scaledPosY = this.scaleByPixelRatio(posY);
        
        if (color) {
            pointer.color = color;
        }

        pointer.texcoordX = scaledPosX / this.canvas.width;
        pointer.texcoordY = 1.0 - scaledPosY / this.canvas.height;
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        
        this.onSplatCallback({
            texcoordX: pointer.texcoordX,
            texcoordY: pointer.texcoordY,
            prevTexcoordX: pointer.prevTexcoordX,
            prevTexcoordY: pointer.prevTexcoordY,
            deltaX: 0,
            deltaY: 0,
            color: pointer.color
        });
    }

    public applyInputs(): void {
        // This method is now just a stub to maintain compatibility
        // The actual updates are happening in the animation loop
    }
}