
import { db } from '../database.js';
import { depthEngine } from './depthEngine.js';
import { CapabilityContext } from '../types.js';

class CapabilityResolver {
    
    /**
     * Resolves the final CapabilityContext for a specific user at this moment in time.
     * Logic: User Base Depth + Active Boosts = Final Depth Level
     */
    public async resolve(userId: string): Promise<CapabilityContext> {
        // 1. Get Base User Depth
        const user = await db.getUser(userId);
        if (!user) {
            // Fallback for detached/error states
            return depthEngine.resolve(1); 
        }

        let totalDepth = user.depthLevel || 1;

        // 2. Apply Active Boosts
        const activeBoosts = await db.getActiveDepthBoosts(userId);
        
        let boostDelta = 0;
        for (const boost of activeBoosts) {
            boostDelta += boost.depthDelta;
        }

        totalDepth += boostDelta;

        // 3. Resolve Final Context via Engine
        const context = depthEngine.resolve(totalDepth);

        // 4. Log Telemetry (Sampled or specific triggers)
        // Only log if boosted to save DB space, or if high depth
        if (boostDelta > 0 || totalDepth > 5) {
            await db.logDepthEvent(userId, 'DEPTH_RESOLVED', { 
                base: user.depthLevel, 
                boost: boostDelta, 
                final: totalDepth 
            });
        }

        return context;
    }
}

export const capabilityResolver = new CapabilityResolver();
