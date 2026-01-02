
import { CapabilityContext } from '../types.js';

class DepthEngine {
    
    /**
     * Mathematical core that converts a raw integer level into 
     * specific cognitive capabilities.
     * Deterministic function: f(depthLevel) => CapabilityContext
     */
    public resolve(depthLevel: number): CapabilityContext {
        // Clamp depth level to safe bounds (1-10)
        const safeDepth = Math.max(1, Math.min(10, depthLevel));

        return {
            depthLevel: safeDepth,
            
            // Linear progression for Horizon (Time window in hours)
            // L1=24h, L5=120h (5 days), L10=240h (10 days)
            horizonHours: 24 * safeDepth,

            // Logarithmic-like progression for Memory (Conversation context depth)
            // L1=10 msgs, L5=20 msgs, L10=30 msgs
            memoryDepth: 10 + Math.floor(safeDepth * 2),

            // Step function for Inference Passes (Cognitive rounds)
            // L1-3 = 1 pass (Fast)
            // L4-7 = 2 passes (Deep)
            // L8-10 = 3 passes (Reasoning Chain)
            inferencePasses: Math.floor((safeDepth - 1) / 3) + 1,

            // Threshold strictness (Higher depth = Only high confidence signals)
            // L1 = 50% (Noisy), L10 = 85% (Precise)
            confidenceThreshold: 50 + Math.floor(safeDepth * 3.5),

            // Aggressiveness in simulation
            simulationAggressiveness: 10 * safeDepth,

            // Variation Depth for Campaigns (0-100)
            // Controls jitter variance. High depth = highly variable/human timing.
            variationDepth: 10 * safeDepth,

            // Feature Flags
            canPredictTrends: safeDepth >= 3,
            canAnalyzeHiddenSignals: safeDepth >= 5,
            canAutoReplyStrategic: safeDepth >= 7
        };
    }
}

export const depthEngine = new DepthEngine();
