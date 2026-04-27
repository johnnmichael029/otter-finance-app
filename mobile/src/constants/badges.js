/**
 * OTTER — Badge Definitions
 * Central source for all achievement metadata.
 */

export const BADGES = [
    {
        id: 'otter_beginner',
        name: 'Otter Beginner',
        description: 'Logged your very first transaction!',
        icon: 'star',
        color: '#FFD700', // Gold
        condition: 'First transaction recorded'
    },
    {
        id: 'saver_pro',
        name: 'Saver Pro',
        description: 'Reach your first ₱1,000 in savings.',
        icon: 'trending-up',
        color: '#22c55e', // Green
        condition: 'Savings balance >= 1000'
    },
    {
        id: 'debt_crusher',
        name: 'Debt Crusher',
        description: 'Successfully paid off a debt record.',
        icon: 'shield-check',
        color: '#3b82f6', // Blue
        condition: 'One debt marked as fully paid'
    },
    {
        id: 'master_planner',
        name: 'Master Planner',
        description: 'Tracking 3 or more recurring bills.',
        icon: 'calendar',
        color: '#E91E8C', // Pink
        condition: '3+ recurring bills active'
    },
    {
        id: 'consistent_otter',
        name: 'Consistent Otter',
        description: 'Logged transactions for 7 days in a row.',
        icon: 'zap',
        color: '#f59e0b', // Amber
        condition: '7-day streak'
    },
    {
        id: 'goal_getter',
        name: 'Goal Getter',
        description: 'Completed a customized savings goal.',
        icon: 'award',
        color: '#8b5cf6', // Purple
        condition: 'Savings goal 100% reached'
    },
    {
        id: 'thirty_day_streak',
        name: '30-Day Streak',
        description: 'Logged transactions for 30 days in a row.',
        icon: 'fire',
        color: '#ef4444', // Red
        condition: '30-day streak'
    },
    {
        id: 'social_saver',
        name: 'Social Saver',
        description: 'Joined or created a shared savings goal.',
        icon: 'users',
        color: '#06b6d4', // Cyan
        condition: 'Shared goal participation'
    },
    {
        id: 'frugal_five',
        name: 'Frugal Five',
        description: 'Stayed under budget in 5 categories this month.',
        icon: 'scissors-cutting',
        color: '#10b981', // Emerald
        condition: '5 categories under budget'
    }
];
