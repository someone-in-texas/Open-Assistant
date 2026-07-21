const WINDOW = "1 minute";

export const standardRateLimit = { max: 60, timeWindow: WINDOW };
export const mutationRateLimit = { max: 30, timeWindow: WINDOW };
export const expensiveRateLimit = { max: 10, timeWindow: WINDOW };
