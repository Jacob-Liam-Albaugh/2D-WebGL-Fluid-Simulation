export class DuffingOscillator {
    private x: number = 0;
    private y: number = 0;
    private dx: number = 0;
    private dy: number = 0;
    private delta: number;  // damping coefficient
    private beta: number;   // linear stiffness
    private alpha: number;  // cubic stiffness
    private gamma: number;  // forcing amplitude
    private omega: number;  // forcing frequency
    private time: number = 0;
    private phaseOffset: number; // Phase offset for varied motion
    private baseX: number;  // Base position offset
    private baseY: number;  // Base position offset
    private index: number;  // Oscillator index for symmetric positioning
    private totalOscillators: number;
    
    constructor(
        params: {
            delta?: number,  // damping
            beta?: number,   // linear stiffness
            alpha?: number,  // cubic stiffness
            gamma?: number,  // forcing amplitude
            omega?: number,  // forcing frequency
            phaseOffset?: number, // phase offset
            index?: number,  // oscillator index
            total?: number   // total number of oscillators
        } = {}
    ) {
        this.delta = params.delta ?? 0.2;
        this.beta = params.beta ?? 0.1;
        this.alpha = params.alpha ?? 1.2;
        this.gamma = params.gamma ?? 1.0;
        this.omega = params.omega ?? 0.5;
        this.index = params.index ?? 0;
        this.totalOscillators = params.total ?? 1;
        
        // Calculate phase offset based on position in the circle
        this.phaseOffset = (2 * Math.PI * this.index) / this.totalOscillators;
        
        // Position oscillators in a perfect circle
        const angle = this.phaseOffset;
        const radius = 0.3;
        this.baseX = Math.cos(angle) * radius;
        this.baseY = Math.sin(angle) * radius;
        
        // Initialize with symmetric velocities
        this.dx = Math.cos(angle + Math.PI/2) * 0.05;
        this.dy = Math.sin(angle + Math.PI/2) * 0.05;
    }

    public update(dt: number): { x: number, y: number, dx: number, dy: number } {
        // Implementation of the Duffing equation with symmetric forcing
        const forcingX = this.gamma * Math.cos(this.omega * this.time + this.phaseOffset);
        const forcingY = this.gamma * Math.sin(this.omega * this.time + this.phaseOffset);
        
        // Update velocities using the Duffing equation
        this.dx += (-this.delta * this.dx - this.beta * this.x - this.alpha * Math.pow(this.x, 3) + forcingX) * dt;
        this.dy += (-this.delta * this.dy - this.beta * this.y - this.alpha * Math.pow(this.y, 3) + forcingY) * dt;
        
        const dx = this.baseX - this.x;
        const dy = this.baseY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Add progressive containment force
        const maxDist = 0.4;
        if (dist > maxDist) {
            const containmentForce = 0.2 * (dist - maxDist) / maxDist;
            this.dx += (dx / dist) * containmentForce;
            this.dy += (dy / dist) * containmentForce;
        }
        
        // Update positions
        this.x += this.dx * dt;
        this.y += this.dy * dt;
        
        this.time += dt;
        
        // Scale the output with reduced symmetric scaling
        const scale = 0.4; 
        return {
            x: (this.x + this.baseX) * scale,
            y: (this.y + this.baseY) * scale,
            dx: this.dx * scale,
            dy: this.dy * scale
        };
    }

    public reset(): void {
        // Reset to initial symmetric position
        const angle = (2 * Math.PI * this.index) / this.totalOscillators;
        const radius = 0.4;
        this.baseX = Math.cos(angle) * radius;
        this.baseY = Math.sin(angle) * radius;
        this.x = 0;
        this.y = 0;
        this.dx = Math.cos(angle + Math.PI/2) * 0.05;
        this.dy = Math.sin(angle + Math.PI/2) * 0.05;
        this.time = 0;
    }
} 