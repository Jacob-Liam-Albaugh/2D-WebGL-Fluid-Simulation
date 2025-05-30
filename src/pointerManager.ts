import { PointerData, RGBColor, SplatData } from './types';

export class PointerManager {
    private pointers: PointerData[] = [];
    private canvas: HTMLCanvasElement;
    private getColorCallback: () => RGBColor;
    private onSplatCallback: (splatData: SplatData) => void;

    constructor(
        canvas: HTMLCanvasElement, 
        getColorCallback: () => RGBColor,
        onSplatCallback: (splatData: SplatData) => void
    ) {
        this.canvas = canvas;
        this.getColorCallback = getColorCallback;
        this.onSplatCallback = onSplatCallback;
        this.pointers = [this.createPointer()];
        this.initializeEventListeners();
    }

    private createPointer(): PointerData {
        return {
            id: -1,
            texcoordX: 0,
            texcoordY: 0,
            prevTexcoordX: 0,
            prevTexcoordY: 0,
            deltaX: 0,
            deltaY: 0,
            down: false,
            moved: false,
            color: this.getColorCallback()
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

    private updatePointerDownData(pointer: PointerData, id: number, posX: number, posY: number): void {
        pointer.id = id;
        pointer.down = true;
        pointer.moved = false;
        pointer.texcoordX = posX / this.canvas.width;
        pointer.texcoordY = 1.0 - posY / this.canvas.height;
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.deltaX = 0;
        pointer.deltaY = 0;
        pointer.color = this.getColorCallback();
    }

    private updatePointerMoveData(pointer: PointerData, posX: number, posY: number): void {
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = posX / this.canvas.width;
        pointer.texcoordY = 1.0 - posY / this.canvas.height;
        pointer.deltaX = this.correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
        pointer.deltaY = this.correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
        pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;

        // Immediately trigger splat callback when moved
        if (pointer.moved && pointer.down) {
            this.onSplatCallback({
                texcoordX: pointer.texcoordX,
                texcoordY: pointer.texcoordY,
                prevTexcoordX: pointer.prevTexcoordX,
                prevTexcoordY: pointer.prevTexcoordY,
                deltaX: pointer.deltaX,
                deltaY: pointer.deltaY,
                color: pointer.color
            });
        }
    }

    private updatePointerUpData(pointer: PointerData): void {
        pointer.down = false;
    }

    private initializeEventListeners(): void {
        this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
            const posX = this.scaleByPixelRatio(e.offsetX);
            const posY = this.scaleByPixelRatio(e.offsetY);
            let pointer = this.pointers[0]; // Always use the first pointer for simplicity
            this.updatePointerDownData(pointer, -1, posX, posY);
        });

        this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            const pointer = this.pointers[0];
            if (!pointer.down) return;
            const posX = this.scaleByPixelRatio(e.offsetX);
            const posY = this.scaleByPixelRatio(e.offsetY);
            this.updatePointerMoveData(pointer, posX, posY);
        });

        window.addEventListener('mouseup', () => {
            this.updatePointerUpData(this.pointers[0]);
        });
    }

    // Method to manually trigger a splat at a specific position
    public generateSplat(posX: number, posY: number, color?: RGBColor): void {
        const pointer = this.createPointer();
        const scaledPosX = this.scaleByPixelRatio(posX);
        const scaledPosY = this.scaleByPixelRatio(posY);
        
        if (color) {
            pointer.color = color;
        }

        this.updatePointerDownData(pointer, -2, scaledPosX, scaledPosY);
        this.updatePointerMoveData(pointer, scaledPosX + 1, scaledPosY + 1); // Small movement to trigger splat
    }

    // Method to process all pointer inputs
    public applyInputs(): void {
        this.pointers.forEach(pointer => {
            if (pointer.moved) {
                pointer.moved = false;
                this.onSplatCallback({
                    texcoordX: pointer.texcoordX,
                    texcoordY: pointer.texcoordY,
                    prevTexcoordX: pointer.prevTexcoordX,
                    prevTexcoordY: pointer.prevTexcoordY,
                    deltaX: pointer.deltaX,
                    deltaY: pointer.deltaY,
                    color: pointer.color
                });
            }
        });
    }
} 