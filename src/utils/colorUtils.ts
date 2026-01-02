// Utility functions for color manipulation

/**
 * Interpolates between two RGBA colors.
 * @param color1 The first color string (e.g., 'rgba(255,0,0,0.5)').
 * @param color2 The second color string.
 * @param factor The interpolation factor (0 to 1).
 * @returns An RGBA color string.
 */
export function interpolateColor(color1: string, color2: string, factor: number): string {
    const parseColor = (c: string) => {
        const rgbaMatch = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d*)\)?/);
        if (rgbaMatch) {
            return {
                r: parseInt(rgbaMatch[1]),
                g: parseInt(rgbaMatch[2]),
                b: parseInt(rgbaMatch[3]),
                a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
            };
        }
        return { r: 0, g: 0, b: 0, a: 1 }; // Fallback
    };

    const c1 = parseColor(color1);
    const c2 = parseColor(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    const a = c1.a + (c2.a - c1.a) * factor;

    return `rgba(${r},${g},${b},${a})`;
}

/**
 * Converts a hex color string to an RGB object.
 * @param hex The hex color string (e.g., '#RRGGBB' or '#RGB').
 * @returns An object with r, g, b properties, or null if invalid.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}
