class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number, timeWindowMs: number) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the time window
    this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindow);
    
    // If we're at the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 1;
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot(); // Recursive call after waiting
      }
    }
    
    // Add current request timestamp
    this.requests.push(now);
  }
}

// Google APIs have different rate limits:
// - Admin Directory API: 1,500 requests per 100 seconds per user
// - Drive API: 1,000 requests per 100 seconds per user  
// - Gmail API: 250 quota units per user per second (1 request = 1 unit for most operations)

export const adminApiLimiter = new RateLimiter(15, 1000); // 15 requests per second (conservative)
export const driveApiLimiter = new RateLimiter(10, 1000); // 10 requests per second (conservative)
export const gmailApiLimiter = new RateLimiter(5, 1000);  // 5 requests per second (conservative)