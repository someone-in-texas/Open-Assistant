const WINDOW = "1 minute";

function routeRateLimit(max: number) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: WINDOW,
      },
    },
  };
}

export const standardRateLimit = routeRateLimit(60);
export const mutationRateLimit = routeRateLimit(30);
export const expensiveRateLimit = routeRateLimit(10);
