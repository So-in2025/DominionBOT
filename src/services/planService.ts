
import { PlanType, User } from '../types.js';

interface PlanFeatures {
    auto_reply: boolean;
    professional_tone: boolean;
    intent_detection: boolean;
    lead_scoring: boolean;
    priority_alerts: boolean;
    close_assist: boolean;
}

const PLANS: Record<PlanType, PlanFeatures> = {
    starter: {
        auto_reply: true,
        professional_tone: true,
        intent_detection: false,
        lead_scoring: false,
        priority_alerts: false,
        close_assist: false,
    },
    pro: {
        auto_reply: true,
        professional_tone: true,
        intent_detection: true,
        lead_scoring: true,
        priority_alerts: true,
        close_assist: true,
    }
};

class PlanService {
    public getClientFeatures(user: User): PlanFeatures {
        // If plan is not active OR trial, return a basic feature set (or starter)
        // FIX: Treat 'trial' as having access to features
        if (user.plan_status !== 'active' && user.plan_status !== 'trial') {
            return PLANS.starter;
        }
        return PLANS[user.plan_type] || PLANS.starter;
    }
}

export const planService = new PlanService();
